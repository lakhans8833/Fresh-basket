/**
 * Production-readiness audit (4 Nov 2026): regression tests for the fixes made in that round.
 * - PRICE_CHANGED: an order is never placed at a total the customer didn't see.
 * - UPI orders with a customer-reported UTR aren't auto-cancelled as "payment failed"; customers can't
 *   self-cancel them while unchecked; the dashboard counts them.
 * - Shop-wide cap on open guest orders holds under a burst of concurrent orders.
 * - Stock movement history (database trigger) with reasons; admin audit log (no request bodies).
 * - Customers can't read staff ids / internal order columns through the database API.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, istDateString, whatsappOrderSchema, type PlaceOrderInput } from "@freshbasket/shared";

// Enough connections for a real concurrent burst (the default pool is 3 per instance).
vi.hoisted(() => {
  process.env.DB_POOL_MAX = "12";
});

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const who = vi.hoisted(() => ({ session: null as null | { userId: string; profile: { role: string; email: string | null } } }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSession: async () => who.session,
  requireStaff: async () => who.session,
  requireAdmin: async () => who.session,
}));

import { asUser, pool, query, queryOne } from "@/lib/db";
import { customerCancel, placeOrder, placeWhatsAppOrder, releaseExpired } from "@/lib/orders";
import { submitUpiReference } from "@/lib/payments/upi";
import { adminStats } from "@/lib/admin/orders";
import { PATCH as inventoryPatch } from "@/app/api/admin/inventory/route";

const tomorrow = addDays(istDateString(new Date()), 1);
let slot = "";
let onion = "";
let onionProduct = "";

const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: onion, quantity: 4 }],
    address: { label: "Home", fullName: "Audit Test", phone: "9876543210", line1: `PR lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;

beforeAll(async () => {
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  const r = (await queryOne<{ id: string; product_id: string }>(
    "select v.id, v.product_id from product_variants v join products p on p.id = v.product_id where p.slug = 'onion' and v.label = '1 kg'",
  ))!;
  onion = r.id;
  onionProduct = r.product_id;
  await query("update delivery_slots set capacity = 1000");
  await query("update store_settings set upi_id = 'freshbasket.test@okaxis', cod_enabled = true");
  await query("update products set stock_grams = greatest(stock_grams, 2000000) where id = $1", [onionProduct]);
});
afterAll(async () => {
  await pool.end();
});

describe("PRICE_CHANGED: the order total must be the one the customer saw", () => {
  it("refuses (409 PRICE_CHANGED, nothing saved) when the total changed; places it when it matches", async () => {
    const key = randomUUID();
    const before = (await queryOne<{ n: number }>("select count(*)::int as n from orders"))!.n;
    await expect(placeOrder(CUSTOMER, input({ idempotencyKey: key, expectedTotal: 1 }))).rejects.toMatchObject({ status: 409, code: "PRICE_CHANGED" });
    expect((await queryOne<{ n: number }>("select count(*)::int as n from orders"))!.n).toBe(before);
    // Learn the real total, then the same key places the order at exactly that total.
    const err = await placeOrder(CUSTOMER, input({ idempotencyKey: key, expectedTotal: 1 })).catch((e) => e as { details: { total: number } });
    const total = (err as { details: { total: number } }).details.total;
    const { order } = await placeOrder(CUSTOMER, input({ idempotencyKey: key, expectedTotal: total }));
    expect(order.total).toBe(total);
    // Older app versions that don't send it still work.
    await expect(placeOrder(CUSTOMER, input())).resolves.toBeTruthy();
  });
});

describe("UPI orders with a reported UTR", () => {
  it("aren't released as 'payment failed' when the hold expires (within 48 h), can't be self-cancelled, and are counted", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    await submitUpiReference(order.id, `UTR${Date.now()}`);
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
    await releaseExpired();
    let row = await queryOne<{ status: string; payment_status: string }>("select status, payment_status from orders where id = $1", [order.id]);
    expect([row!.status, row!.payment_status]).toEqual(["pending_payment", "pending"]);
    expect(((await adminStats()) as unknown as { upiToCheck: number }).upiToCheck).toBeGreaterThanOrEqual(1);
    await expect(customerCancel(CUSTOMER, order.id)).rejects.toMatchObject({ status: 409, code: "UPI_CLAIMED" });

    // Unchecked for more than 48 h after the UTR: expires as before.
    await query("update orders set upi_reference_at = now() - interval '49 hours' where id = $1", [order.id]);
    await releaseExpired();
    row = await queryOne("select status, payment_status from orders where id = $1", [order.id]);
    expect(row!.status).toBe("cancelled");
  });

  it("a UPI order WITHOUT a UTR still expires normally", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
    await releaseExpired();
    expect((await queryOne<{ status: string }>("select status from orders where id = $1", [order.id]))!.status).toBe("cancelled");
  });
});

describe("shop-wide cap on open guest orders", () => {
  it("a concurrent burst can't push the shop past 40 open guest orders", async () => {
    let n = Math.floor(Math.random() * 1e6);
    const wa = () =>
      whatsappOrderSchema.parse({
        items: [{ variantId: onion, quantity: 4 }],
        customer: { name: "Guest", phone: `96${String(10000000 + (++n % 89999999)).padStart(8, "0")}`, address: `House ${n}, Lane`, area: "", city: "Bengaluru", pincode: "560034", notes: "" },
        paymentMethod: "cod", idempotencyKey: randomUUID(),
      });
    const open = async () =>
      (await queryOne<{ n: number }>("select count(*)::int as n from orders where user_id is null and status in ('pending_payment','pending_confirmation')"))!.n;
    const created: string[] = [];
    try {
      while ((await open()) < 38) created.push((await placeWhatsAppOrder(null, wa())).order.id);
      const res = await Promise.allSettled(Array.from({ length: 8 }, () => placeWhatsAppOrder(null, wa())));
      for (const r of res) if (r.status === "fulfilled") created.push(r.value.order.id);
      expect(await open()).toBeLessThanOrEqual(40);
      expect(res.filter((r) => r.status === "fulfilled").length).toBe(2);
    } finally {
      // Leave no open guest orders behind for the other test files (stock is returned too).
      for (const id of created) await query("select cancel_order($1, 'system', 'test cleanup')", [id]);
    }
  }, 60_000);
});

describe("stock movement history", () => {
  it("records every change with its reason and order (grams for products sold by weight)", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    const placed = await query<{ unit: string; delta: string; reason: string }>(
      "select unit, delta::text, reason from stock_movements where order_id = $1 order by id", [order.id],
    );
    expect(placed).toEqual([{ unit: "g", delta: "-4000", reason: "order_placed" }]);
    await customerCancel(CUSTOMER, order.id);
    const all = await query<{ delta: string; reason: string }>("select delta::text, reason from stock_movements where order_id = $1 order by id", [order.id]);
    expect(all.map((m) => [m.delta, m.reason])).toEqual([["-4000", "order_placed"], ["4000", "order_cancelled"]]);
  });

  it("can't be read or written by customers", async () => {
    await expect(asUser(CUSTOMER, (c) => c.query("select * from stock_movements limit 1"))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(CUSTOMER, (c) => c.query("select * from admin_audit_log limit 1"))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("admin audit log", () => {
  const patch = (body: unknown) =>
    inventoryPatch(new Request("http://localhost/api/admin/inventory", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {});

  it("records who changed what (method, path, status) without the request body; the stock change is labelled admin_edit", async () => {
    who.session = { userId: ADMIN, profile: { role: "admin", email: null } };
    const before = (await queryOne<{ id: string }>("select coalesce(max(id), 0)::text as id from admin_audit_log"))!.id;
    const cur = Number((await queryOne<{ g: string }>("select stock_grams::text as g from products where id = $1", [onionProduct]))!.g);
    const res = await patch({ updates: [], products: [{ productId: onionProduct, stockGrams: cur + 1000, stockGramsLoaded: cur }], requestId: randomUUID() });
    expect(res.status).toBe(200);
    const rows = await query<Record<string, unknown>>("select actor_id, actor_role, method, path, status from admin_audit_log where id > $1", [before]);
    expect(rows).toEqual([{ actor_id: ADMIN, actor_role: "admin", method: "PATCH", path: "/api/admin/inventory", status: 200 }]);
    const cols = (await query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'admin_audit_log'")).map((c) => c.column_name);
    expect(cols.some((c) => /body|payload|password|token|otp/i.test(c))).toBe(false);
    const m = await queryOne<{ delta: string; reason: string }>("select delta::text, reason from stock_movements where product_id = $1 order by id desc limit 1", [onionProduct]);
    expect(m).toEqual({ delta: "1000", reason: "admin_edit" });
  });

  it("refused attempts by signed-in users are recorded; anonymous requests are not", async () => {
    const before = (await queryOne<{ id: string }>("select coalesce(max(id), 0)::text as id from admin_audit_log"))!.id;
    who.session = { userId: CUSTOMER, profile: { role: "staff", email: null } };
    // Staff may not change prices → 403, recorded.
    const r = await patch({ updates: [{ variantId: onion, price: 5000 }], products: [] });
    expect(r.status).toBe(403);
    who.session = null;
    await patch({ updates: [], products: [] }).catch(() => undefined);
    const rows = await query<{ actor_id: string; status: number }>("select actor_id, status from admin_audit_log where id > $1", [before]);
    expect(rows).toEqual([{ actor_id: CUSTOMER, status: 403 }]);
  });
});

describe("column-level read grants", () => {
  it("customers read their own orders, but not staff ids or internal order fields", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    const own = await asUser(CUSTOMER, (c) => c.query("select id, status, total from orders where id = $1", [order.id]));
    expect(own.rows).toHaveLength(1);
    await expect(asUser(CUSTOMER, (c) => c.query("select actor from order_events where order_id = $1", [order.id]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(CUSTOMER, (c) => c.query("select idempotency_key from orders where id = $1", [order.id]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(CUSTOMER, (c) => c.query("select created_by from order_adjustments limit 1"))).rejects.toMatchObject({ code: "42501" });
    // The customer order screens still load (they select only allowed columns).
    const { getMyOrder } = await import("@/lib/orders");
    expect((await getMyOrder(CUSTOMER, order.id))?.id).toBe(order.id);
  });
});
