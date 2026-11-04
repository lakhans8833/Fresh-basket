/**
 * Audit round 8 (5 Nov 2026): one public address (canonical host), the admin audit log and the
 * stock ledger.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { canonicalRedirect } from "@/lib/canonical-host";
import { json, route } from "@/lib/http";
import { sanitize } from "@/lib/audit";
import { requestContext, setActor } from "@/lib/request-context";
import { customerCancel, placeOrder } from "@/lib/orders";
import { adminPatchInventory } from "@/lib/admin/catalog";

const ADMIN = "00000000-0000-4000-8000-0000000000a8";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1"; // seeded test customer
const tomorrow = addDays(istDateString(new Date()), 1);
let vid = "";
let pid = "";
let slot = "";

beforeAll(async () => {
  // A product counted in packs (not by weight), made for this test.
  const cat = (await queryOne<{ id: string }>("select id from categories where active limit 1"))!.id;
  const tag = randomUUID().slice(0, 8);
  pid = (await queryOne<{ id: string }>("insert into products (slug, name, category_id, description, active) values ($1, $2, $3, 'test', true) returning id", [`ledger-${tag}`, `Ledger ${tag}`, cat]))!.id;
  vid = (await queryOne<{ id: string }>("insert into product_variants (product_id, label, price, stock, active) values ($1, '1 pc', 5000, 0, true) returning id", [pid]))!.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update product_variants set stock = 200 where id = $1", [vid]);
});
afterAll(async () => {
  await pool.end();
});

describe("one public address", () => {
  const u = (s: string) => new URL(s);
  const APP = "https://fresh-basket-veg.vercel.app";
  it("production pages on another host go to the shop's address (path and query kept)", () => {
    expect(canonicalRedirect(u("https://fresh-basket-brown.vercel.app/product/tomato?x=1"), "fresh-basket-brown.vercel.app", "GET", APP, "production")?.toString()).toBe(
      "https://fresh-basket-veg.vercel.app/product/tomato?x=1",
    );
  });
  it("leaves the right host, previews, APIs, sign-in links and form posts alone", () => {
    expect(canonicalRedirect(u(`${APP}/shop`), "fresh-basket-veg.vercel.app", "GET", APP, "production")).toBeNull();
    expect(canonicalRedirect(u("https://x-git-branch.vercel.app/shop"), "x-git-branch.vercel.app", "GET", APP, "preview")).toBeNull();
    expect(canonicalRedirect(u("https://b.vercel.app/api/orders"), "b.vercel.app", "GET", APP, "production")).toBeNull();
    expect(canonicalRedirect(u("https://b.vercel.app/auth/callback?code=1"), "b.vercel.app", "GET", APP, "production")).toBeNull();
    expect(canonicalRedirect(u("https://b.vercel.app/login"), "b.vercel.app", "POST", APP, "production")).toBeNull();
    expect(canonicalRedirect(u("https://b.vercel.app/"), "b.vercel.app", "GET", undefined, "production")).toBeNull();
    expect(canonicalRedirect(u("https://b.vercel.app/"), "b.vercel.app", "GET", "http://localhost:3000", "production")).toBeNull();
  });
});

describe("admin audit log", () => {
  it("records a saving admin call with who did it, and never stores passwords or tokens", async () => {
    const handler = route(async (req: Request) => {
      setActor({ id: ADMIN, email: "owner@test.local", role: "admin" });
      const body = (await req.json()) as Record<string, unknown>;
      return json({ ok: true, got: Object.keys(body).length });
    });
    const marker = randomUUID();
    const res = await handler(
      new Request("https://shop.example/api/admin/users/abc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marker, password: "hunter2-secret", nested: { accessToken: "tok", note: "x".repeat(500) } }),
      }),
      {},
    );
    expect(res.status).toBe(200);
    const row = (await queryOne<{ actor_id: string; actor_role: string; method: string; path: string; status: number; details: Record<string, unknown> }>(
      "select actor_id, actor_role, method, path, status, details from admin_audit_log where details->>'marker' = $1",
      [marker],
    ))!;
    expect(row).toMatchObject({ actor_id: ADMIN, actor_role: "admin", method: "POST", path: "/api/admin/users/abc", status: 200 });
    expect(row.details.password).toBe("[hidden]");
    expect((row.details.nested as Record<string, string>).accessToken).toBe("[hidden]");
    expect((row.details.nested as Record<string, string>).note.length).toBeLessThan(220);
    expect(JSON.stringify(row.details)).not.toContain("hunter2");
  });

  it("a refused call (not staff) and reads are not logged; a failed save is logged with its status", async () => {
    const before = (await queryOne<{ n: number }>("select count(*)::int as n from admin_audit_log"))!.n;
    await route(async () => json({ ok: true }))(new Request("https://shop.example/api/admin/orders", { method: "GET" }), {});
    await route(async () => { throw new Error("nope"); })(new Request("https://shop.example/api/admin/orders/1", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }), {});
    expect((await queryOne<{ n: number }>("select count(*)::int as n from admin_audit_log"))!.n).toBe(before);
    const failing = route(async () => {
      setActor({ id: ADMIN, email: null, role: "staff" });
      return json({ error: "conflict" }, { status: 409 });
    });
    await failing(new Request("https://shop.example/api/admin/orders/2", { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"status":"packed"}' }), {});
    const last = (await queryOne<{ status: number; path: string }>("select status, path from admin_audit_log order by id desc limit 1"))!;
    expect(last).toEqual({ status: 409, path: "/api/admin/orders/2" });
  });

  it("sanitize keeps the shape but cuts long lists", () => {
    const out = sanitize({ items: Array.from({ length: 40 }, (_, i) => i) }) as { items: unknown[] };
    expect(out.items).toHaveLength(26);
  });
});

describe("stock ledger", () => {
  const input = (): PlaceOrderInput =>
    ({
      items: [{ variantId: vid, quantity: 3 }],
      address: { label: "Home", fullName: "Ledger Test", phone: "9876543210", line1: `Lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
      saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null,
    }) as PlaceOrderInput;
  const lastId = async () => (await queryOne<{ n: string }>("select coalesce(max(id), 0)::text as n from stock_movements"))!.n;
  const moves = async (afterId: string) =>
    query<{ change: string; reason: string | null; actor_id: string | null; unit: string }>(
      "select change::text, reason, actor_id, unit from stock_movements where variant_id = $1 and id > $2 order by id",
      [vid, afterId],
    );

  it("an order takes stock and a cancellation gives it back, each with the reason", async () => {
    const t0 = await lastId();
    const { order } = await placeOrder(CUSTOMER, input());
    await customerCancel(CUSTOMER, order.id);
    const m = await moves(t0);
    expect(m.map((x) => [x.change, x.reason])).toEqual([["-3", "order placed (website/app)"], ["3", "order cancelled by customer"]]);
  });

  it("an admin stock edit records who did it", async () => {
    const t0 = await lastId();
    const cur = (await queryOne<{ s: number }>("select stock as s from product_variants where id = $1", [vid]))!.s;
    await requestContext.run({}, async () => {
      setActor({ id: ADMIN, email: null, role: "admin" });
      await adminPatchInventory([{ variantId: vid, stock: cur + 7, stockLoaded: cur }], [], randomUUID());
    });
    const m = await moves(t0);
    expect(m.at(-1)).toMatchObject({ change: "7", reason: "inventory edited in Admin", actor_id: ADMIN, unit: "packs" });
  });

  it("customers can't read the ledger or the audit log", async () => {
    const { asUser } = await import("@/lib/db");
    await asUser(CUSTOMER, async (c) => {
      expect((await c.query("select * from stock_movements limit 1")).rows).toEqual([]);
      expect((await c.query("select * from admin_audit_log limit 1")).rows).toEqual([]);
    });
  });
});
