/**
 * Integration tests against a real Postgres with the production migrations and RLS.
 * Covers: server-side totals, stock reservation & overselling, idempotency, coupons,
 * payment processing (duplicates, amount mismatch, late payment), expiry, permissions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne, asUser } from "@/lib/db";
import { placeOrder, getMyOrder, releaseExpired, customerCancel, reorderItems, getOrderById } from "@/lib/orders";
import { processPaymentEvent, normaliseRazorpayEvent } from "@/lib/payments/process";
import { verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { adminUpdateOrderStatus, adminUpdatePaymentStatus } from "@/lib/admin/orders";
import { listAddresses, saveAddress } from "@/lib/account";
import { buildQuote } from "@/lib/quote";
import { adminListUsers, adminSetRole } from "@/lib/admin/users";
import { payToken } from "@/lib/tokens";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
let OTHER = "";

const tomorrow = addDays(istDateString(new Date()), 1);
let eveningSlot = "";
const v: Record<string, string> = {};

const address = {
  label: "Home", fullName: "Test Customer", phone: "9876543210", line1: "12, 4th Cross", city: "Bengaluru",
  state: "Karnataka", pincode: "560034", isDefault: false,
};

// Each test order gets its own address line, so it isn't treated as a duplicate of the previous
// one (the server refuses an identical order from the same customer within 2 minutes).
let orderNo = 0;
function input(o: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    items: [{ variantId: v["tomato:500 g"]!, quantity: 4 }], // ₹128 — above the ₹99 minimum
    address: { ...address, line1: `${address.line1}, flat ${++orderNo}` }, saveAddress: false, slotId: eveningSlot, deliveryDate: tomorrow, paymentMethod: "cod",
    idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  } as PlaceOrderInput;
}

const stock = async (id: string) => (await queryOne<{ stock: number }>("select stock from product_variants where id = $1", [id]))!.stock;

beforeAll(async () => {
  const rows = await query<{ id: string; slug: string; label: string }>(
    "select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id",
  );
  for (const r of rows) v[`${r.slug}:${r.label}`] = r.id;
  eveningSlot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  // Make capacity large so tests don't interfere; one dedicated tiny slot is created below.
  await query("update delivery_slots set capacity = 1000");
  OTHER = (await queryOne<{ id: string }>("insert into auth.users (email) values ('other@freshbasket.local') returning id"))!.id;
});

afterAll(async () => {
  await pool.end();
});

describe("checkout totals are computed on the server", () => {
  it("places a COD order with DB prices, delivery fee and reserved stock", async () => {
    const before = await stock(v["tomato:500 g"]!);
    const { order, created } = await placeOrder(CUSTOMER, input());
    expect(created).toBe(true);
    expect(order.status).toBe("placed");
    expect(order.paymentStatus).toBe("cod_pending");
    expect(order.subtotal).toBe(3200 * 4);
    expect(order.deliveryFee).toBe(2500); // 560034: ₹25 below ₹499
    expect(order.total).toBe(12800 + 2500);
    expect(await stock(v["tomato:500 g"]!)).toBe(before - 4);
    expect(order.events[0]?.status).toBe("placed");
  });

  it("rejects orders below the area minimum and unserviceable PIN codes", async () => {
    await expect(placeOrder(CUSTOMER, input({ items: [{ variantId: v["coriander:100 g"]!, quantity: 1 }] }))).rejects.toMatchObject({ status: 409 });
    await expect(placeOrder(CUSTOMER, input({ address: { ...address, pincode: "110001" } }))).rejects.toMatchObject({ status: 409 });
  });

  it("waives delivery above the free-delivery threshold", async () => {
    const q = await buildQuote({ items: [{ variantId: v["potato:2 kg"]!, quantity: 4 }], pincode: "560034" });
    expect(q.quote.subtotal).toBe(54000);
    expect(q.quote.deliveryFee).toBe(0);
  });

  it("is idempotent for retries with the same key", async () => {
    const key = randomUUID();
    const a = await placeOrder(CUSTOMER, input({ idempotencyKey: key }));
    const b = await placeOrder(CUSTOMER, input({ idempotencyKey: key }));
    expect(b.created).toBe(false);
    expect(b.order.id).toBe(a.order.id);
    const [{ n }] = (await query<{ n: number }>("select count(*)::int as n from orders where idempotency_key = $1", [key])) as [{ n: number }];
    expect(n).toBe(1);
  });

  it("rejects payment methods that aren't enabled", async () => {
    await expect(placeOrder(CUSTOMER, input({ paymentMethod: "razorpay" }))).rejects.toMatchObject({ status: 400 });
    await query("update store_settings set cod_enabled = false");
    try {
      await expect(placeOrder(CUSTOMER, input())).rejects.toMatchObject({ status: 400 });
    } finally {
      await query("update store_settings set cod_enabled = true");
    }
  });
});

describe("duplicate orders", () => {
  it("returns the first order when the same order is resubmitted with a new key", async () => {
    const same = input();
    const a = await placeOrder(CUSTOMER, same);
    const b = await placeOrder(CUSTOMER, { ...same, idempotencyKey: randomUUID() });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.order.id).toBe(a.order.id);
  });
  it("creates exactly one order for simultaneous identical submissions (double click)", async () => {
    const same = input();
    const results = await Promise.all([0, 1, 2, 3].map(() => placeOrder(CUSTOMER, { ...same, idempotencyKey: randomUUID() })));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
  });
  it("still allows a different order right away", async () => {
    const a = await placeOrder(CUSTOMER, input());
    const b = await placeOrder(CUSTOMER, input({ items: [{ variantId: v["tomato:500 g"]!, quantity: 5 }] }));
    expect(b.created).toBe(true);
    expect(b.order.id).not.toBe(a.order.id);
  });
});

describe("inventory", () => {
  it("never oversells under concurrent checkouts", async () => {
    const id = v["spinach:250 g"]!;
    await query("update product_variants set stock = 4 where id = $1", [id]);
    const attempts = Array.from({ length: 10 }, () =>
      placeOrder(CUSTOMER, input({ items: [{ variantId: id, quantity: 1 }, { variantId: v["potato:1 kg"]!, quantity: 2 }] }))
        .then(() => "ok")
        .catch((e) => (e as { status?: number }).status ?? "error"),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(4);
    expect(results.filter((r) => r === 409)).toHaveLength(6);
    expect(await stock(id)).toBe(0);
  });

  it("restocks when a customer cancels before packing, and blocks cancel after", async () => {
    const id = v["carrot:1 kg"]!;
    const before = await stock(id);
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: id, quantity: 3 }] }));
    expect(await stock(id)).toBe(before - 3);
    const cancelled = await customerCancel(CUSTOMER, order.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.paymentStatus).toBe("cod_cancelled"); // nothing left to collect
    expect(await stock(id)).toBe(before);

    const { order: o2 } = await placeOrder(CUSTOMER, input({ items: [{ variantId: id, quantity: 2 }] }));
    await adminUpdateOrderStatus(o2.id, "packed", ADMIN);
    await expect(customerCancel(CUSTOMER, o2.id)).rejects.toMatchObject({ status: 409 });
  });

  it("enforces slot capacity", async () => {
    const slot = (await queryOne<{ id: string }>(
      "insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity) values ('Tiny', '18:00', '19:00', 0, 1) returning id",
    ))!.id;
    await placeOrder(CUSTOMER, input({ slotId: slot }));
    await expect(placeOrder(CUSTOMER, input({ slotId: slot }))).rejects.toMatchObject({ status: 409 });
    await query("update delivery_slots set active = false where id = $1", [slot]);
  });
});

describe("coupons", () => {
  it("first-order coupons only work for a customer's first order", async () => {
    // CUSTOMER already has orders from earlier tests.
    const items = [{ variantId: v["tomato:1 kg"]!, quantity: 6 }];
    await expect(placeOrder(CUSTOMER, input({ items, couponCode: "WELCOME50" }))).rejects.toMatchObject({ status: 409 });
    const q = await buildQuote({ items, couponCode: "WELCOME50", pincode: "560034" }, { userId: CUSTOMER });
    expect(q.quote.issues.find((i) => i.code === "COUPON_INVALID")).toMatchObject({ reason: "This coupon is only for your first order." });
    const guest = await buildQuote({ items, couponCode: "WELCOME50", pincode: "560034" }, {});
    expect(guest.quote.issues.find((i) => i.code === "COUPON_INVALID")).toMatchObject({ reason: "Sign in to use this first-order coupon." });
  });

  it("applies once per user and is released on cancellation", async () => {
    const items = [{ variantId: v["potato:2 kg"]!, quantity: 3 }]; // ₹405
    const { order } = await placeOrder(OTHER, input({ items, couponCode: "WELCOME50" }));
    expect(order.discount).toBe(5000);
    expect(order.total).toBe(40500 - 5000 + 2500);
    await expect(placeOrder(OTHER, input({ items, couponCode: "WELCOME50" }))).rejects.toMatchObject({ status: 409 });
    await customerCancel(OTHER, order.id);
    const again = await placeOrder(OTHER, input({ items, couponCode: "WELCOME50" }));
    expect(again.order.discount).toBe(5000);
  });
});

describe("payments", () => {
  async function pendingMockOrder() {
    await query("update store_settings set cod_enabled = true");
    // Test payments are available in non-production environments without Razorpay keys.
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "mock" }));
    expect(order.status).toBe("pending_payment");
    expect(order.paymentStatus).toBe("pending");
    expect(order.reservationExpiresAt).not.toBeNull();
    return order;
  }
  const captured = (orderId: string, eventId: string, amount: number, paymentId = `pay_${orderId.slice(0, 6)}`) =>
    processPaymentEvent({
      provider: "mock", eventId, type: "payment.captured", rawType: "payment.captured",
      providerOrderId: null, paymentId, amount, orderId, payload: {},
    });

  it("marks paid once, ignores duplicate deliveries of the same event", async () => {
    const order = await pendingMockOrder();
    expect(await captured(order.id, "evt_1", order.total)).toBe("paid");
    expect(await captured(order.id, "evt_1", order.total)).toBe("duplicate");
    expect(await captured(order.id, "evt_2", order.total)).toBe("already_processed");
    const o = await getOrderById(order.id);
    expect(o?.status).toBe("placed");
    expect(o?.paymentStatus).toBe("paid");
    const [{ n }] = (await query<{ n: number }>("select count(*)::int as n from payments where order_id = $1", [order.id])) as [{ n: number }];
    expect(n).toBe(1);
  });

  it("does not mark paid when the amount does not match", async () => {
    const order = await pendingMockOrder();
    expect(await captured(order.id, "evt_mismatch", order.total - 100)).toBe("amount_mismatch");
    expect((await getOrderById(order.id))?.paymentStatus).toBe("pending");
  });

  it("records failed attempts without changing the order", async () => {
    const order = await pendingMockOrder();
    const r = await processPaymentEvent({
      provider: "mock", eventId: "evt_fail", type: "payment.failed", rawType: "payment.failed",
      providerOrderId: null, paymentId: "pay_failed", amount: order.total, orderId: order.id, payload: {},
    });
    expect(r).toBe("failed_recorded");
    expect((await getOrderById(order.id))?.status).toBe("pending_payment");
  });

  it("releases stock when payment isn't completed in time, and re-reserves on a late payment", async () => {
    const id = v["tomato:500 g"]!;
    const before = await stock(id);
    const order = await pendingMockOrder();
    expect(await stock(id)).toBe(before - 4);
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
    expect(await releaseExpired()).toBeGreaterThanOrEqual(1);
    expect((await getOrderById(order.id))?.status).toBe("cancelled");
    expect(await stock(id)).toBe(before);

    expect(await captured(order.id, "evt_late", order.total)).toBe("paid_late");
    const o = await getOrderById(order.id);
    expect(o?.status).toBe("placed");
    expect(o?.paymentStatus).toBe("paid");
    expect(await stock(id)).toBe(before - 4);
  });

  it("flags a refund when a late payment can't be fulfilled", async () => {
    const id = v["broccoli:500 g"]!;
    const order = (await placeOrder(CUSTOMER, input({ paymentMethod: "mock", items: [{ variantId: id, quantity: 2 }] }))).order;
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
    await releaseExpired();
    await query("update product_variants set stock = 0 where id = $1", [id]);
    expect(await captured(order.id, "evt_late2", order.total)).toBe("refund_required");
    expect((await getOrderById(order.id))?.paymentStatus).toBe("refund_pending");
    await adminUpdatePaymentStatus(order.id, "refunded", ADMIN);
    expect((await getOrderById(order.id))?.paymentStatus).toBe("refunded");
  });

  it("verifies Razorpay checkout and webhook signatures", () => {
    const secret = "rzp_test_secret";
    const sig = createHmac("sha256", secret).update("order_ABC|pay_XYZ").digest("hex");
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig, secret)).toBe(true);
    expect(verifyCheckoutSignature("order_ABC", "pay_OTHER", sig, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig, undefined)).toBe(false);
    const body = JSON.stringify({ event: "payment.captured" });
    const wsig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, wsig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body + " ", wsig, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
  });

  it("maps Razorpay webhook payloads (order.paid and payment.captured) to the same payment", async () => {
    const order = await pendingMockOrder();
    await query("update orders set razorpay_order_id = 'order_TEST1' where id = $1", [order.id]);
    const payment = { entity: { id: "pay_TEST1", order_id: "order_TEST1", amount: order.total, status: "captured" } };
    const e1 = normaliseRazorpayEvent({ event: "payment.captured", payload: { payment } }, "rzp_evt_1");
    const e2 = normaliseRazorpayEvent({ event: "order.paid", payload: { payment, order: { entity: { id: "order_TEST1" } } } }, "rzp_evt_2");
    expect(await processPaymentEvent({ ...e1, provider: "razorpay" })).toBe("paid");
    expect(await processPaymentEvent({ ...e2, provider: "razorpay" })).toBe("already_processed");
  });

  it("pay tokens are bound to one order", () => {
    const t = payToken.issue("11111111-1111-4111-8111-111111111111");
    expect(payToken.verify("11111111-1111-4111-8111-111111111111", t)).toBe(true);
    expect(payToken.verify("22222222-2222-4222-8222-222222222222", t)).toBe(false);
    expect(payToken.verify("11111111-1111-4111-8111-111111111111", t + "x")).toBe(false);
  });
});

describe("permissions (row-level security)", () => {
  it("customers cannot see other customers' orders or addresses", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    expect(await getMyOrder(CUSTOMER, order.id)).not.toBeNull();
    expect(await getMyOrder(OTHER, order.id)).toBeNull();
    await expect(reorderItems(OTHER, order.id)).rejects.toMatchObject({ status: 404 });

    const a = await saveAddress(CUSTOMER, null, address);
    expect((await listAddresses(OTHER)).find((x) => x.id === a.id)).toBeUndefined();
    await expect(saveAddress(OTHER, a.id, { ...address, line1: "hijack" })).rejects.toMatchObject({ status: 404 });
  });

  it("customers cannot write orders, coupons or their own role directly", async () => {
    await expect(asUser(CUSTOMER, (c) => c.query("update orders set total = 1"))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(CUSTOMER, (c) => c.query("update profiles set role = 'admin' where id = auth.uid()"))).rejects.toMatchObject({ code: "42501" });
    const coupons = await asUser(CUSTOMER, async (c) => (await c.query("select * from coupons")).rows);
    expect(coupons).toHaveLength(0);
    await expect(asUser(CUSTOMER, (c) => c.query("select mark_order_paid(gen_random_uuid(), 'mock', null, 'x', 1, 'x')"))).rejects.toMatchObject({ code: "42501" });
  });

  it("admin status changes follow the allowed workflow", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await expect(adminUpdateOrderStatus(order.id, "delivered", ADMIN)).rejects.toMatchObject({ status: 409 });
    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    await adminUpdateOrderStatus(order.id, "out_for_delivery", ADMIN);
    await expect(adminUpdatePaymentStatus(order.id, "cod_collected", ADMIN)).rejects.toMatchObject({ status: 409 });
    const done = await adminUpdateOrderStatus(order.id, "delivered", ADMIN);
    expect(done.status).toBe("delivered");
    await expect(adminUpdateOrderStatus(order.id, "cancelled", ADMIN)).rejects.toMatchObject({ status: 409 });
    expect((await adminUpdatePaymentStatus(order.id, "cod_collected", ADMIN)).paymentStatus).toBe("cod_collected");
  });

  it("pending online orders cannot be marked placed by staff", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "mock" }));
    await expect(adminUpdateOrderStatus(order.id, "placed", ADMIN)).rejects.toMatchObject({ status: 409 });
  });
});

describe("admin users", () => {
  it("lists users with email status and changes roles safely", async () => {
    const users = await adminListUsers();
    expect(users.find((u) => u.id === ADMIN)?.role).toBe("admin");
    expect(users.every((u) => "emailConfirmedAt" in u)).toBe(true);
    // can't change your own role
    await expect(adminSetRole(ADMIN, ADMIN, "customer")).rejects.toMatchObject({ status: 400 });
    // promote / demote someone else
    await adminSetRole(ADMIN, OTHER, "staff");
    expect((await queryOne<{ role: string }>("select role from profiles where id = $1", [OTHER]))!.role).toBe("staff");
    await adminSetRole(ADMIN, OTHER, "customer");
    // the only admin can't be demoted
    const admins = (await query<{ n: number }>("select count(*)::int as n from profiles where role = 'admin'"))[0]!.n;
    expect(admins).toBe(1);
    await expect(adminSetRole(OTHER, ADMIN, "customer")).rejects.toMatchObject({ status: 409 });
  });
});
