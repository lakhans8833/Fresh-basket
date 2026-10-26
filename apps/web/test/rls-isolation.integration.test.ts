/**
 * Row-level security checked at the DATABASE, as Supabase's own roles (anon / authenticated) — i.e. what
 * a browser holding the public anon key could do by talking to Supabase directly, bypassing our API.
 * Two separate customer accounts + a signed-out visitor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { asUser, pool, query, queryOne, tx } from "@/lib/db";
import { placeOrder } from "@/lib/orders";
import { saveAddress } from "@/lib/account";
import { adminSaveSettings } from "@/lib/admin/config";
import { getSettings, legalGaps } from "@/lib/settings";

let A = "";
let B = "";
let orderA = "";
let addressA = "";
let variant = "";
let slot = "";

const asAnon = <T>(fn: (c: PoolClient) => Promise<T>) =>
  tx(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await c.query("set local role anon");
    return fn(c);
  });
const rows = async (p: Promise<{ rows: unknown[] }>) => (await p).rows.length;
const denied = { code: "42501" };

beforeAll(async () => {
  A = (await queryOne<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`rls-a-${randomUUID().slice(0, 6)}@x.example`]))!.id;
  B = (await queryOne<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`rls-b-${randomUUID().slice(0, 6)}@x.example`]))!.id;
  for (const id of [A, B]) await query("insert into profiles (id, email) values ($1, (select email from auth.users where id = $1)) on conflict do nothing", [id]);
  variant = (await queryOne<{ id: string }>("select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'"))!.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update product_variants set stock = greatest(stock, 50) where id = $1", [variant]);
  const address = { label: "Home", fullName: "RLS Tester", phone: "9876543210", line1: `RLS lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false };
  addressA = (await saveAddress(A, null, address)).id;
  const input = {
    items: [{ variantId: variant, quantity: 4 }], address, saveAddress: false, slotId: slot, deliveryDate: addDays(istDateString(new Date()), 1),
    paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null,
  } as PlaceOrderInput;
  orderA = (await placeOrder(A, input)).order.id;
});

afterAll(async () => {
  await pool.end();
});

describe("two customers can't see each other's data", () => {
  it("customer A sees their own order, items, history, address and profile", async () => {
    await asUser(A, async (c) => {
      expect(await rows(c.query("select id from orders where id = $1", [orderA]))).toBe(1);
      expect(await rows(c.query("select id from order_items where order_id = $1", [orderA]))).toBeGreaterThan(0);
      expect(await rows(c.query("select id from order_events where order_id = $1", [orderA]))).toBeGreaterThan(0);
      expect(await rows(c.query("select id from addresses where id = $1", [addressA]))).toBe(1);
      expect(await rows(c.query("select id from profiles where id = $1", [A]))).toBe(1);
    });
  });

  it("customer B gets nothing of A's — even when asking by id", async () => {
    await asUser(B, async (c) => {
      expect(await rows(c.query("select id from orders where id = $1", [orderA]))).toBe(0);
      expect(await rows(c.query("select id from order_items where order_id = $1", [orderA]))).toBe(0);
      expect(await rows(c.query("select id from order_events where order_id = $1", [orderA]))).toBe(0);
      expect(await rows(c.query("select id from addresses where id = $1", [addressA]))).toBe(0);
      expect(await rows(c.query("select id from profiles where id = $1", [A]))).toBe(0);
      expect(await rows(c.query("select id from payments"))).toBe(0);
      expect(await rows(c.query("select id from coupon_redemptions"))).toBe(0);
    });
  });

  it("B can't change, delete or plant addresses in A's account", async () => {
    await asUser(B, async (c) => {
      expect((await c.query("update addresses set line1 = 'hijacked' where id = $1", [addressA])).rowCount).toBe(0);
      expect((await c.query("delete from addresses where id = $1", [addressA])).rowCount).toBe(0);
    });
    await expect(
      asUser(B, (c) => c.query("insert into addresses (user_id, label, full_name, phone, line1, city, state, pincode) values ($1,'x','x','9876543210','x','x','x','560034')", [A])),
    ).rejects.toThrow(/row-level security/);
    expect((await queryOne<{ line1: string }>("select line1 from addresses where id = $1", [addressA]))!.line1).not.toBe("hijacked");
  });
});

describe("customers can't change prices, stock, orders or store settings directly", () => {
  it("order, item, payment and event tables are read-only for customers", async () => {
    await expect(asUser(A, (c) => c.query("update orders set total = 1 where id = $1", [orderA]))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("update orders set status = 'delivered', payment_status = 'paid' where id = $1", [orderA]))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("update order_items set unit_price = 1 where order_id = $1", [orderA]))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("delete from orders where id = $1", [orderA]))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("insert into payments (order_id, provider, amount, status) values ($1, 'mock', 1, 'captured')", [orderA]))).rejects.toMatchObject(denied);
  });

  it("catalogue, stock, delivery areas and settings can't be edited by a customer", async () => {
    const before = await queryOne<{ price: number; stock: number }>("select price, stock from product_variants where id = $1", [variant]);
    await asUser(A, async (c) => {
      expect((await c.query("update product_variants set price = 1, stock = 99999 where id = $1", [variant])).rowCount).toBe(0);
      expect((await c.query("update products set active = false")).rowCount).toBe(0);
      expect((await c.query("update delivery_areas set fee = 0")).rowCount).toBe(0);
      expect((await c.query("update store_settings set cod_enabled = false")).rowCount).toBe(0);
      expect((await c.query("update coupons set value = 100")).rowCount).toBe(0);
    });
    await expect(asUser(A, (c) => c.query("insert into delivery_areas (pincode, area_name, city) values ('999999', 'x', 'x')"))).rejects.toThrow(/row-level security/);
    expect(await queryOne("select price, stock from product_variants where id = $1", [variant])).toEqual(before);
  });

  it("a customer can't make themselves staff or admin", async () => {
    await expect(asUser(A, (c) => c.query("update profiles set role = 'admin' where id = auth.uid()"))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("insert into profiles (id, email, role) values (gen_random_uuid(), 'x@x.example', 'admin')"))).rejects.toMatchObject(denied);
    expect((await queryOne<{ role: string }>("select role from profiles where id = $1", [A]))!.role).toBe("customer");
  });

  it("payment and stock functions can't be called by customers", async () => {
    await expect(asUser(A, (c) => c.query("select mark_order_paid($1, 'mock', null, 'x', 1, 'x')", [orderA]))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("select cancel_order($1, 'x', 'x')", [orderA]))).rejects.toMatchObject(denied);
    await expect(asUser(A, (c) => c.query("select release_order_stock($1)", [orderA]))).rejects.toMatchObject(denied);
  });
});

describe("signed-out visitors (anon key)", () => {
  it("see no private data", async () => {
    await asAnon(async (c) => {
      for (const t of ["orders", "order_items", "order_events", "addresses", "profiles", "payments", "payment_events", "coupons", "coupon_redemptions", "support_messages", "newsletter_subscribers"]) {
        const n = await c.query(`select count(*)::int as n from ${t}`).then((r) => r.rows[0].n as number, (e: { code?: string }) => (e.code === "42501" ? 0 : Promise.reject(e)));
        expect(n, t).toBe(0);
      }
      await expect(c.query("select 1 from rate_limits")).rejects.toMatchObject(denied);
    });
  });

  it("see only active products, categories and delivery areas, and can't write anything", async () => {
    await query("update products set active = false where slug = 'agentb-apple'");
    await asAnon(async (c) => {
      expect(await rows(c.query("select id from products where not active"))).toBe(0);
      expect(await rows(c.query("select id from delivery_areas where not active"))).toBe(0);
      expect(await rows(c.query("select id from products where active"))).toBeGreaterThan(0);
    });
    await expect(asAnon((c) => c.query("update product_variants set price = 1"))).rejects.toMatchObject(denied);
    await expect(asAnon((c) => c.query("insert into support_messages (name, email, message) values ('x','x@x.example','x')"))).rejects.toMatchObject(denied);
  });
});

describe("legal & policy details (Admin → Settings)", () => {
  it("save and load; missing details are listed for the owner, not invented", async () => {
    const s0 = await getSettings();
    const base = {
      storeName: s0.storeName, tagline: s0.tagline, logoUrl: s0.logoUrl, supportPhone: s0.supportPhone, supportEmail: s0.supportEmail ?? "", whatsapp: s0.whatsapp,
      address: s0.address, supportHours: s0.supportHours, instagram: null, facebook: null, youtube: null, x: null, codEnabled: s0.codEnabled,
      defaultMinOrder: s0.defaultMinOrder, slotDaysAhead: s0.slotDaysAhead, announcement: s0.announcement,
    };
    await adminSaveSettings({ ...base, legal: { name: "", address: null, registration: null, grievanceOfficer: null, grievanceEmail: "", jurisdiction: null, updated: "" } } as never);
    expect(legalGaps(await getSettings())).toEqual(["Registered business name", "Registered address", "Grievance officer name & email", "Policies last-updated date"]);

    await adminSaveSettings({ ...base, legal: { name: "Test Traders", address: "Shop 1, Test Market", registration: "GSTIN TEST", grievanceOfficer: "Test Officer", grievanceEmail: "grievance@x.example", jurisdiction: "Test City", updated: "2026-10-27" } } as never);
    const s = await getSettings();
    expect(s.legal).toEqual({ name: "Test Traders", address: "Shop 1, Test Market", registration: "GSTIN TEST", grievanceOfficer: "Test Officer", grievanceEmail: "grievance@x.example", jurisdiction: "Test City", updated: "2026-10-27" });
    expect(legalGaps(s)).toEqual([]);

    // Older admin screens (no "legal" in the request) leave the details alone.
    await adminSaveSettings(base as never);
    expect((await getSettings()).legal.name).toBe("Test Traders");
  });
});
