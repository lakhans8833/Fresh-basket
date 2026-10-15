/**
 * Integration tests against a real Postgres with the production migrations and RLS.
 * Covers: server-side totals, stock reservation & overselling, idempotency, coupons,
 * payment processing (duplicates, amount mismatch, late payment), expiry, permissions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { addDays, istDateString, whatsappOrderSchema, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne, asUser } from "@/lib/db";
import { placeOrder, placeWhatsAppOrder, getMyOrder, releaseExpired, customerCancel, reorderItems, getOrderById } from "@/lib/orders";
import { adminConfirmUpiPayment, submitUpiReference, upiPaymentInfo } from "@/lib/payments/upi";
import { notifyOrderEvent, type WhatsAppCloudConfig } from "@/lib/notify/whatsapp";
import { trackToken } from "@/lib/tokens";
import { getSettings } from "@/lib/settings";
import { processPaymentEvent, normaliseRazorpayEvent } from "@/lib/payments/process";
import { verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { adminGetOrder, adminListOrders, adminStats, adminUpdateOrderStatus, adminUpdatePaymentStatus } from "@/lib/admin/orders";
import { listAddresses, saveAddress } from "@/lib/account";
import { buildQuote } from "@/lib/quote";
import { adminConfirmEmail, adminListUsers, adminResendConfirmation, adminSetRole } from "@/lib/admin/users";
import { payToken } from "@/lib/tokens";
import { getProduct, listProducts } from "@/lib/catalog";
import { adminListReviews, adminSetReviewStatus, getProductReviews, reviewEligibility, submitReview } from "@/lib/reviews";

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
    await query("update products set stock_grams = 1000 where slug = 'spinach'"); // 4 × 250 g
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

  it("sells every weight pack from one total in grams", async () => {
    const grams = async () => Number((await queryOne<{ g: string }>("select stock_grams as g from products where slug = 'pumpkin'"))!.g);
    await query("update products set stock_grams = 3000 where slug = 'pumpkin'"); // 3 kg
    expect(await stock(v["pumpkin:500 g"]!)).toBe(6);
    expect(await stock(v["pumpkin:1 kg"]!)).toBe(3);

    // A mixed cart shares the same kilos: 2 × 1 kg + 2 × 500 g = 3 kg, all of it.
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: v["pumpkin:1 kg"]!, quantity: 2 }, { variantId: v["pumpkin:500 g"]!, quantity: 2 }] }));
    expect(await grams()).toBe(0);
    expect(await stock(v["pumpkin:500 g"]!)).toBe(0);
    expect(await stock(v["pumpkin:1 kg"]!)).toBe(0);

    // Cancelling gives the grams back, so every size is available again.
    await customerCancel(CUSTOMER, order.id);
    expect(await grams()).toBe(3000);
    expect(await stock(v["pumpkin:500 g"]!)).toBe(6);

    // 2 × 1 kg + 3 × 500 g = 3.5 kg > 3 kg: refused, nothing taken.
    await expect(
      placeOrder(CUSTOMER, input({ items: [{ variantId: v["pumpkin:1 kg"]!, quantity: 2 }, { variantId: v["pumpkin:500 g"]!, quantity: 3 }] })),
    ).rejects.toMatchObject({ status: 409 });
    expect(await grams()).toBe(3000);
  });

  it("never oversells a weight total when different sizes are ordered at once", async () => {
    await query("update products set stock_grams = 2000 where slug = 'potato'"); // 2 kg
    const sizes = ["potato:500 g", "potato:1 kg", "potato:2 kg"];
    const attempts = Array.from({ length: 12 }, (_, i) =>
      placeOrder(CUSTOMER, input({ items: [{ variantId: v[sizes[i % 3]!]!, quantity: 1 }, { variantId: v["onion:1 kg"]!, quantity: 1 + (i % 4) }] }))
        .then(() => (i % 3 === 0 ? 500 : i % 3 === 1 ? 1000 : 2000))
        .catch((e) => { expect((e as { status?: number }).status).toBe(409); return 0; }),
    );
    const sold = (await Promise.all(attempts)).reduce((a, b) => a + b, 0);
    const left = Number((await queryOne<{ g: string }>("select stock_grams as g from products where slug = 'potato'"))!.g);
    expect(sold).toBeLessThanOrEqual(2000);
    expect(sold + left).toBe(2000);
    expect(await stock(v["potato:500 g"]!)).toBe(Math.floor(left / 500));
    await query("update products set stock_grams = 80000 where slug = 'potato'"); // restock for later tests
  });

  it("returns the grams that were sold even if the pack is renamed later", async () => {
    const grams = async () => Number((await queryOne<{ g: string }>("select stock_grams as g from products where slug = 'cucumber'"))!.g);
    await query("update products set stock_grams = 10000 where slug = 'cucumber'");
    const id = v["cucumber:500 g"]!;
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: id, quantity: 4 }] })); // 2 kg
    expect(await grams()).toBe(8000);
    await query("update product_variants set label = '1 kg' where id = $1", [id]); // admin renames the pack
    await customerCancel(CUSTOMER, order.id);
    expect(await grams()).toBe(10000); // not 12000
    await query("update product_variants set label = '500 g' where id = $1", [id]);
  });

  it("doesn't deadlock when cancellations and checkouts touch the same products", async () => {
    await query("update products set stock_grams = 200000 where slug in ('tomato', 'onion')");
    // Variant ids sort differently from product ids for many pairs; run both directions repeatedly.
    const items = [{ variantId: v["tomato:500 g"]!, quantity: 1 }, { variantId: v["onion:1 kg"]!, quantity: 2 }];
    const placed = await Promise.all(Array.from({ length: 6 }, (_, i) => placeOrder(CUSTOMER, input({ items: items.map((x) => ({ ...x, quantity: x.quantity + i })) }))));
    const results = await Promise.allSettled([
      ...placed.map((p) => customerCancel(CUSTOMER, p.order.id)),
      ...Array.from({ length: 6 }, (_, i) => placeOrder(CUSTOMER, input({ items: [...items].reverse().map((x) => ({ ...x, quantity: x.quantity + 10 + i })) }))),
    ]);
    const failed = results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason?.code ?? (r as PromiseRejectedResult).reason));
    expect(failed).toEqual([]);
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
    await query("update products set stock_grams = 0 where slug = 'broccoli'");
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

describe("shop listing", () => {
  it("puts products with every size sold out last, whatever the sort", async () => {
    for (const sort of ["featured", "price_asc", "price_desc", "name"] as const) {
      const items = await listProducts({ sort });
      const firstOut = items.findIndex((p) => !p.inStock);
      expect(firstOut).toBeGreaterThan(0); // capsicum is sold out in the sample data
      expect(items.slice(firstOut).every((p) => !p.inStock)).toBe(true);
    }
  });
});

describe("late orders", () => {
  it("flags placed orders whose delivery slot has ended, until they are packed", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: v["onion:1 kg"]!, quantity: 3 }] }));
    const isLate = async () => (await adminListOrders({})).find((o) => (o as { id: string }).id === order.id) as { late: boolean } | undefined;
    expect((await isLate())?.late).toBe(false); // slot is tomorrow
    const lateCount = async () => ((await adminStats()) as Record<string, unknown>).lateOrders as number;
    const before = await lateCount();

    await query("update orders set delivery_date = delivery_date - 3 where id = $1", [order.id]);
    expect((await isLate())?.late).toBe(true);
    expect((await adminListOrders({ status: "late" })).map((o) => (o as { id: string }).id)).toContain(order.id);
    expect((await adminGetOrder(order.id)).late).toBe(true);
    expect(await lateCount()).toBe(before + 1);

    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    expect((await isLate())?.late).toBe(false);
    expect(await lateCount()).toBe(before);
  });
});

describe("admin email confirmation", () => {
  it("confirms an unconfirmed email (and is a no-op when already confirmed)", async () => {
    const id = (await queryOne<{ id: string }>("insert into auth.users (email) values ('newbie@freshbasket.local') returning id"))!.id;
    await query("insert into profiles (id, email) values ($1, 'newbie@freshbasket.local') on conflict do nothing", [id]);
    const before = (await adminListUsers("newbie")).find((u) => u.id === id);
    expect(before?.emailConfirmedAt).toBeNull();
    const r = await adminConfirmEmail(id);
    expect(r.emailConfirmedAt).toBeTruthy();
    expect((await adminListUsers("newbie")).find((u) => u.id === id)?.emailConfirmedAt).toBe(r.emailConfirmedAt);
    expect((await adminConfirmEmail(id)).emailConfirmedAt).toBe(r.emailConfirmedAt);
    await expect(adminResendConfirmation(id)).rejects.toMatchObject({ status: 409 }); // already confirmed
    await expect(adminConfirmEmail("00000000-0000-4000-8000-000000000999")).rejects.toMatchObject({ status: 404 });
  });
});

describe("cached catalogue filtering", () => {
  it("searches Hindi names, categories and slugs, and filters by category", async () => {
    expect((await listProducts({ q: "tamatar" })).map((p) => p.slug)).toContain("tomato");
    expect((await listProducts({ q: "LADIES finger" })).map((p) => p.slug)).toContain("ladies-finger");
    const cat = (await listProducts({ q: "tomato" }))[0]!;
    const inCat = await listProducts({ category: (await queryOne<{ slug: string }>("select slug from categories where id = $1", [cat.categoryId]))!.slug });
    expect(inCat.every((p) => p.categoryId === cat.categoryId)).toBe(true);
    expect(await listProducts({ ids: [] })).toEqual([]);
  });
});

describe("product reviews", () => {
  it("only customers with a delivered order can review; only approved reviews count", async () => {
    const product = (await getProduct("beetroot"))!;
    const id = v["beetroot:500 g"]!;
    expect((await reviewEligibility(CUSTOMER, product.id)).canReview).toBe(false);
    await expect(submitReview(CUSTOMER, product.id, 5, "Great")).rejects.toMatchObject({ status: 403 });

    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: id, quantity: 4 }] }));
    await expect(submitReview(CUSTOMER, product.id, 5, "Great")).rejects.toMatchObject({ status: 403 }); // not delivered yet
    for (const s of ["packed", "out_for_delivery", "delivered"] as const) await adminUpdateOrderStatus(order.id, s, ADMIN);
    expect((await reviewEligibility(CUSTOMER, product.id)).canReview).toBe(true);

    const r = await submitReview(CUSTOMER, product.id, 4, "  Fresh and sweet  ");
    expect(r.status).toBe("pending");
    expect(await getProductReviews(product.id)).toMatchObject({ count: 0, average: null, reviews: [] }); // not shown until approved
    expect((await adminListReviews("pending")).map((x) => x.id)).toContain(r.id);

    await adminSetReviewStatus(r.id, "approved");
    const shown = await getProductReviews(product.id);
    expect(shown).toMatchObject({ count: 1, average: 4 });
    expect(shown.reviews[0]).toMatchObject({ rating: 4, comment: "Fresh and sweet", author: "Test" });

    // Editing sends it back for approval; hiding removes it from the page.
    await submitReview(CUSTOMER, product.id, 2, null);
    expect((await getProductReviews(product.id)).count).toBe(0);
    await adminSetReviewStatus(r.id, "hidden");
    expect((await getProductReviews(product.id)).count).toBe(0);
    expect((await reviewEligibility(CUSTOMER, product.id)).mine).toMatchObject({ rating: 2, status: "hidden" });
  });
});

describe("WhatsApp orders", () => {
  let waNo = 0;
  const wa = (o: Record<string, unknown> = {}) =>
    whatsappOrderSchema.parse({
      items: [{ variantId: v["onion:1 kg"]!, quantity: 3 }],
      customer: { name: "Guest Buyer", phone: "98765 43210", address: `House ${++waNo}, Lane 2, near park`, area: "", city: "Bengaluru", pincode: "560034", notes: "" },
      paymentMethod: "cod",
      idempotencyKey: randomUUID(),
      ...o,
    });

  it("saves a guest COD order with server totals before WhatsApp opens, idempotently", async () => {
    const input = wa();
    const { order, created } = await placeWhatsAppOrder(null, input);
    expect(created).toBe(true);
    expect(order).toMatchObject({ status: "placed", paymentMethod: "cod", paymentStatus: "cod_pending", channel: "whatsapp", subtotal: 3 * 4800 });
    expect(order.total).toBe(order.subtotal + order.deliveryFee);
    const row = await queryOne<{ user_id: string | null }>("select user_id from orders where id = $1", [order.id]);
    expect(row!.user_id).toBeNull();
    // Retry with the same key, and a double tap with a new key, both return the same order.
    expect((await placeWhatsAppOrder(null, input)).order.id).toBe(order.id);
    expect((await placeWhatsAppOrder(null, { ...input, idempotencyKey: randomUUID() })).order.id).toBe(order.id);
    const both = await Promise.all([placeWhatsAppOrder(null, wa()), placeWhatsAppOrder(null, wa())]);
    expect(new Set(both.map((b) => b.order.id)).size).toBe(2); // different addresses = different orders
  });

  it("refuses coupons for guests, unknown PIN codes and methods that aren't enabled", async () => {
    await expect(placeWhatsAppOrder(null, wa({ couponCode: "FRESH10" }))).rejects.toMatchObject({ status: 400 });
    await expect(placeWhatsAppOrder(null, wa({ customer: { name: "A B", phone: "9876543210", address: "House 1, Lane 2", city: "Delhi", pincode: "110001" } }))).rejects.toMatchObject({ status: 409 });
    await expect(placeWhatsAppOrder(null, wa({ paymentMethod: "razorpay_link" }))).rejects.toMatchObject({ status: 400 }); // no Razorpay keys here
  });

  it("UPI: reference from the customer keeps it pending; only an admin confirmation marks it paid", async () => {
    await query("update store_settings set upi_id = 'freshbasket.test@okaxis', upi_payee_name = 'Fresh Basket'");
    try {
      const { order } = await placeWhatsAppOrder(null, wa({ paymentMethod: "upi", whatsappUpdates: true }));
      expect(order).toMatchObject({ status: "pending_payment", paymentStatus: "pending", paymentMethod: "upi" });
      const hold = await queryOne<{ h: number }>("select extract(epoch from reservation_expires_at - now()) / 3600 as h from orders where id = $1", [order.id]);
      expect(Number(hold!.h)).toBeCloseTo(3, 1); // guests: 3-hour hold (signed-in customers: 24 hours)

      const info = await upiPaymentInfo(order, await getSettings());
      expect(info!.uri).toContain("pa=freshbasket.test%40okaxis");
      expect(info!.uri).toContain(`am=${(order.total / 100).toFixed(2)}`);
      expect(info!.qrSvg).toContain("<svg");

      await submitUpiReference(order.id, "412345678901");
      expect((await getOrderById(order.id))).toMatchObject({ paymentStatus: "pending", status: "pending_payment", upiReference: "412345678901" });

      const r = await adminConfirmUpiPayment(order.id, { id: ADMIN, email: null }, "412345678901");
      expect(r.result).toBe("paid");
      expect(await getOrderById(order.id)).toMatchObject({ paymentStatus: "paid", status: "placed" });
      await expect(submitUpiReference(order.id, "999999999999")).rejects.toMatchObject({ status: 409 });

      // The same UTR can't confirm a second order.
      const { order: o2 } = await placeWhatsAppOrder(null, wa({ paymentMethod: "upi" }));
      await expect(adminConfirmUpiPayment(o2.id, { id: ADMIN, email: null }, "412345678901")).rejects.toMatchObject({ status: 409 });
    } finally {
      await query("update store_settings set upi_id = null, upi_payee_name = null");
    }
  });

  it("limits unpaid guest UPI orders per mobile number", async () => {
    await query("update store_settings set upi_id = 'freshbasket.test@okaxis'");
    try {
      const phone = "9000000001";
      const cust = (n: number) => ({ name: "Hold Tester", phone, address: `Plot ${n}, Block C, Main Road`, area: "", city: "Bengaluru", pincode: "560034", notes: "" });
      await placeWhatsAppOrder(null, wa({ paymentMethod: "upi", customer: cust(1) }));
      await placeWhatsAppOrder(null, wa({ paymentMethod: "upi", customer: cust(2) }));
      await expect(placeWhatsAppOrder(null, wa({ paymentMethod: "upi", customer: cust(3) }))).rejects.toMatchObject({ status: 409 });
      // Cash on delivery and signed-in customers aren't limited this way.
      expect((await placeWhatsAppOrder(null, wa({ paymentMethod: "cod", customer: cust(4) }))).created).toBe(true);
      expect((await placeWhatsAppOrder(CUSTOMER, wa({ paymentMethod: "upi", customer: cust(5) }))).order.reservationExpiresAt).toBeTruthy();
    } finally {
      await query("update store_settings set upi_id = null");
    }
  });

  it("tracking keys only open their own order", () => {
    const a = randomUUID();
    const b = randomUUID();
    expect(trackToken.verify(a, trackToken.issue(a))).toBe(true);
    expect(trackToken.verify(b, trackToken.issue(a))).toBe(false);
    expect(trackToken.verify(a, "x".repeat(32))).toBe(false);
    expect(trackToken.verify(a, null)).toBe(false);
  });
});

describe("Razorpay payment links", () => {
  async function linkOrder(linkId: string) {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "mock", items: [{ variantId: v["potato:500 g"]!, quantity: 3 }] }));
    await query("update orders set payment_method = 'razorpay_link', razorpay_payment_link_id = $2 where id = $1", [order.id, linkId]);
    return (await getOrderById(order.id))!;
  }
  const event = (linkId: string, amount: number, extra: { linkPaid?: number; status?: string; ref?: string } = {}) => ({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: linkId, reference_id: extra.ref ?? "x", amount_paid: extra.linkPaid ?? amount, status: "paid" } },
      payment: { entity: { id: `pay_${randomUUID().slice(0, 12)}`, order_id: "order_link1", amount, currency: "INR", status: extra.status ?? "captured" } },
    },
  });

  it("marks paid only for a verified, fully paid link of the right amount, once", async () => {
    const o = await linkOrder("plink_ok1");
    const ev = event("plink_ok1", o.total);
    expect(await processPaymentEvent(normaliseRazorpayEvent(ev, "evt_link_1"))).toBe("paid");
    expect(await getOrderById(o.id)).toMatchObject({ status: "placed", paymentStatus: "paid" });
    expect(await processPaymentEvent(normaliseRazorpayEvent(ev, "evt_link_1"))).toBe("duplicate");
    expect(await processPaymentEvent(normaliseRazorpayEvent(event("plink_ok1", o.total), "evt_link_2"))).toBe("already_processed");
  });

  it("rejects wrong amounts, unpaid/uncaptured payments and unknown links", async () => {
    const o = await linkOrder("plink_bad1");
    expect(await processPaymentEvent(normaliseRazorpayEvent(event("plink_bad1", o.total - 100), "evt_link_3"))).toBe("amount_mismatch");
    expect(await processPaymentEvent(normaliseRazorpayEvent(event("plink_bad1", o.total, { linkPaid: o.total - 1 }), "evt_link_4"))).toBe("amount_mismatch");
    expect(await processPaymentEvent(normaliseRazorpayEvent(event("plink_bad1", o.total, { status: "authorized" }), "evt_link_5"))).toBe("ignored");
    expect(await processPaymentEvent(normaliseRazorpayEvent(event("plink_unknown", o.total), "evt_link_6"))).toBe("order_not_found");
    expect(await getOrderById(o.id)).toMatchObject({ status: "pending_payment", paymentStatus: "pending" });
  });

  it("cancelling a payment-link order removes its link", async () => {
    const o = await linkOrder("plink_cancel1");
    await query("update orders set razorpay_payment_link_url = 'https://rzp.io/l/test' where id = $1", [o.id]);
    await customerCancel(CUSTOMER, o.id);
    let url: string | null = "x";
    for (let i = 0; i < 20 && url; i++) {
      url = (await queryOne<{ u: string | null }>("select razorpay_payment_link_url as u from orders where id = $1", [o.id]))!.u;
      if (url) await new Promise((r) => setTimeout(r, 50));
    }
    expect(url).toBeNull();
  });

  it("verifies the webhook signature on the raw body", () => {
    const raw = JSON.stringify(event("plink_sig", 100));
    const sig = createHmac("sha256", "whsec_test").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, sig, "whsec_test")).toBe(true);
    expect(verifyWebhookSignature(raw.replace("100", "1"), sig, "whsec_test")).toBe(false);
    expect(verifyWebhookSignature(raw, null, "whsec_test")).toBe(false);
  });
});

describe("WhatsApp order notifications (Cloud API)", () => {
  const cfg: WhatsAppCloudConfig = {
    accessToken: "test-token", phoneNumberId: "123", apiVersion: "v21.0", apiBase: "https://graph.example.test", language: "en",
    templates: { confirmed: "order_confirmed", packed: "order_packed" },
  };
  const okFetch = (calls: unknown[]) =>
    (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 });
    }) as unknown as typeof fetch;

  it("sends once per event, only with consent, and logs failures", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ whatsappUpdates: true, items: [{ variantId: v["onion:1 kg"]!, quantity: 4 }] }));
    const calls: unknown[] = [];
    expect(await notifyOrderEvent(order.id, "confirmed", { config: cfg, fetchImpl: okFetch(calls) })).toBe("sent");
    expect(await notifyOrderEvent(order.id, "confirmed", { config: cfg, fetchImpl: okFetch(calls) })).toBe("duplicate");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ to: "919876543210", type: "template", template: { name: "order_confirmed", language: { code: "en" } } });
    expect(await notifyOrderEvent(order.id, "delivered", { config: cfg, fetchImpl: okFetch(calls) })).toBe("disabled"); // no template set

    const failing = (async () => new Response(JSON.stringify({ error: { message: "Template not approved", code: 132001 } }), { status: 400 })) as unknown as typeof fetch;
    expect(await notifyOrderEvent(order.id, "packed", { config: cfg, fetchImpl: failing })).toBe("failed");
    expect(await notifyOrderEvent(order.id, "packed", { config: cfg, fetchImpl: okFetch(calls) })).toBe("duplicate"); // retry waits a minute
    const log = await query<{ event: string; status: string; error: string | null }>("select event, status, error from order_notifications where order_id = $1 order by event", [order.id]);
    expect(log).toEqual([
      { event: "confirmed", status: "sent", error: null },
      { event: "packed", status: "failed", error: expect.stringContaining("Template not approved") },
    ]);

    const { order: noConsent } = await placeOrder(CUSTOMER, input({ items: [{ variantId: v["onion:1 kg"]!, quantity: 5 }] }));
    expect(await notifyOrderEvent(noConsent.id, "confirmed", { config: cfg, fetchImpl: okFetch(calls) })).toBe("skipped");
    expect(calls).toHaveLength(1);
    expect(await notifyOrderEvent(noConsent.id, "confirmed")).toBe("disabled"); // no credentials configured in tests
  });
});

describe("review fixes", () => {
  it("a late payment never revives an order the customer cancelled", async () => {
    const order = (await placeOrder(CUSTOMER, input({ paymentMethod: "mock", items: [{ variantId: v["onion:1 kg"]!, quantity: 6 }] }))).order;
    await customerCancel(CUSTOMER, order.id);
    const r = await processPaymentEvent({
      provider: "mock", eventId: `evt_cancelled_${order.id}`, type: "payment.captured", rawType: "payment.captured",
      providerOrderId: null, paymentId: `pay_${order.id.slice(0, 8)}`, amount: order.total, orderId: order.id, payload: {},
    });
    expect(r).toBe("refund_required");
    expect(await getOrderById(order.id)).toMatchObject({ status: "cancelled", paymentStatus: "refund_pending" });
  });

  it("staff see only their own addresses and orders through the customer pages", async () => {
    await saveAddress(CUSTOMER, null, { ...address, label: "Customer home", isDefault: true });
    const mine = await listAddresses(ADMIN);
    expect(mine.every((a) => a.label !== "Customer home")).toBe(true);
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: v["onion:1 kg"]!, quantity: 7 }] }));
    expect(await getMyOrder(ADMIN, order.id)).toBeNull();
    expect(await getMyOrder(CUSTOMER, order.id)).not.toBeNull();
  });
});
