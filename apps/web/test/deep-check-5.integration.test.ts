/**
 * Regression tests for the 31 Oct 2026 audit (round 6):
 * - releasing expired orders no longer deadlocks with a checkout that locks the same products;
 * - order numbers stay unique past 99 999;
 * - a failed WhatsApp update is not re-sent for an order cancelled (or moved on) since;
 * - staff can record cash but only an admin can close a refund.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ role: "staff" as "staff" | "admin" }));
vi.mock("@/lib/auth", () => ({
  requireStaff: async () => ({ userId: "00000000-0000-4000-8000-0000000000a1", profile: { role: who.role, email: null } }),
  getSession: async () => null,
}));

import { randomUUID } from "node:crypto";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { placeOrder } from "@/lib/orders";
import { notifyOrderEvent, retryFailedNotifications, type WhatsAppCloudConfig } from "@/lib/notify/whatsapp";
import { PATCH } from "@/app/api/admin/orders/[id]/route";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const v: Record<string, string> = {};
let slot = "";
const tomorrow = addDays(istDateString(new Date()), 1);
const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: v["onion:1 kg"]!, quantity: 4 }],
    address: { label: "Home", fullName: "Round Six", phone: "9876543210", line1: `R6 lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;

beforeAll(async () => {
  for (const r of await query<{ id: string; slug: string; label: string }>("select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id")) v[`${r.slug}:${r.label}`] = r.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update store_settings set upi_id = 'freshbasket.test@okaxis'");
  await query("update product_variants set stock = greatest(stock, 200) where id = any($1::uuid[])", [[v["onion:1 kg"], v["tomato:500 g"]]]);
});
afterAll(async () => {
  await pool.end();
});

describe("releasing expired orders vs. a checkout", () => {
  it("locks products in id order, so it waits instead of deadlocking", async () => {
    const prod = async (variant: string) => (await queryOne<{ id: string }>("select product_id as id from product_variants where id = $1", [variant]))!.id;
    const onion = await prod(v["onion:1 kg"]!);
    const tomato = await prod(v["tomato:500 g"]!);
    const [first, second] = [onion, tomato].sort();
    // Two expired unpaid orders: the one on the *later* product (by id) expired first, so the old
    // order-by-order release locked the later product before the earlier one.
    const later = second === onion ? v["onion:1 kg"]! : v["tomato:500 g"]!;
    const earlier = later === v["onion:1 kg"] ? v["tomato:500 g"]! : v["onion:1 kg"]!;
    const a = await placeOrder(CUSTOMER, input({ paymentMethod: "upi", items: [{ variantId: later, quantity: 4 }] }));
    const b = await placeOrder(CUSTOMER, input({ paymentMethod: "upi", items: [{ variantId: earlier, quantity: 4 }] }));
    await query("update orders set reservation_expires_at = now() - interval '2 minutes' where id = $1", [a.order.id]);
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [b.order.id]);

    // A checkout holds the earlier product, then asks for the later one while the release runs.
    const checkout = await pool.connect();
    const release = await pool.connect();
    try {
      await checkout.query("begin");
      await checkout.query("select 1 from products where id = $1 for update", [first]);
      const releasing = release.query("select release_expired_reservations() as n");
      await new Promise((r) => setTimeout(r, 300)); // the release is now waiting for `first`
      await checkout.query("set local lock_timeout = '3s'");
      await checkout.query("select 1 from products where id = $1 for update", [second]); // old code: deadlock here
      await checkout.query("commit");
      const n = (await releasing).rows[0]!.n as number;
      expect(n).toBeGreaterThanOrEqual(2);
    } finally {
      checkout.release();
      release.release();
    }
    const st = await query<{ status: string }>("select status from orders where id = any($1::uuid[])", [[a.order.id, b.order.id]]);
    expect(st.every((r) => r.status === "cancelled")).toBe(true);
  });
});

describe("order numbers", () => {
  it("stay unique and full-length past 99 999", async () => {
    await query("select setval('order_number_seq', 99998)");
    const nums: string[] = [];
    for (let i = 0; i < 3; i++) nums.push((await placeOrder(CUSTOMER, input())).order.orderNumber);
    expect(new Set(nums).size).toBe(3);
    expect(nums.map((n) => n.split("-")[1])).toEqual(["99999", "100000", "100001"]);
  });
});

describe("WhatsApp update retries", () => {
  const cfg: WhatsAppCloudConfig = {
    accessToken: "t", phoneNumberId: "1", apiVersion: "v21.0", apiBase: "https://graph.example.test", language: "en",
    templates: { confirmed: "order_confirmed", packed: "order_packed" },
  };
  const failing = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;

  it("aren't sent for an order cancelled since the first attempt failed", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ whatsappUpdates: true }));
    expect(await notifyOrderEvent(order.id, "confirmed", { config: cfg, fetchImpl: failing })).toBe("failed");
    await query("select cancel_order($1, 'admin:test', 'Customer called to cancel')", [order.id]);
    await query("update order_notifications set updated_at = now() - interval '5 minutes' where order_id = $1", [order.id]);
    const calls: unknown[] = [];
    const ok = (async (_u: string, init: RequestInit) => {
      calls.push(init.body);
      return new Response(JSON.stringify({ messages: [{ id: "x" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await notifyOrderEvent(order.id, "confirmed", { config: cfg, fetchImpl: ok, retry: true })).toBe("skipped");
    expect(calls).toHaveLength(0);
    const row = await queryOne<{ status: string; error: string }>("select status, error from order_notifications where order_id = $1", [order.id]);
    expect(row).toEqual({ status: "skipped", error: "Order was cancelled" });
    expect(await retryFailedNotifications()).toBe(0); // nothing left to retry (and no credentials in tests)
  });

  it("aren't sent for a step the order has already moved past", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ whatsappUpdates: true }));
    expect(await notifyOrderEvent(order.id, "confirmed", { config: cfg, fetchImpl: failing })).toBe("failed");
    await query("update orders set status = 'packed' where id = $1", [order.id]);
    await query("update order_notifications set updated_at = now() - interval '5 minutes' where order_id = $1", [order.id]);
    expect(await notifyOrderEvent(order.id, "confirmed", { config: cfg, fetchImpl: failing, retry: true })).toBe("skipped");
  });
});

describe("payment bookkeeping by role", () => {
  const patch = (id: string, body: unknown) =>
    PATCH(new Request(`http://x/api/admin/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

  it("staff can't close a refund; an admin can", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await query("update orders set payment_status = 'refund_pending' where id = $1", [order.id]);
    who.role = "staff";
    expect((await patch(order.id, { paymentStatus: "refunded" })).status).toBe(403);
    who.role = "admin";
    expect((await patch(order.id, { paymentStatus: "refunded" })).status).toBe(200);
    expect((await queryOne<{ s: string }>("select payment_status as s from orders where id = $1", [order.id]))!.s).toBe("refunded");
  });

  it("staff can still record cash collected on delivery", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await query("update orders set status = 'delivered' where id = $1", [order.id]);
    who.role = "staff";
    expect((await patch(order.id, { paymentStatus: "cod_collected" })).status).toBe(200);
  });
});
