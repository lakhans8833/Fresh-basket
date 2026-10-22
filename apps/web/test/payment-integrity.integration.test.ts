/**
 * Regression tests: checkout retry after a cancelled attempt, database-coordinated Razorpay
 * preparation, and fully validated late-payment revival (slot, coupon limits, product availability,
 * duplicate webhooks). Runs against the isolated test database (vitest.config.ts → TEST_DATABASE_URL).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Razorpay "configured" for this file only; the gateway call itself is mocked below (no network).
vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
  process.env.RAZORPAY_KEY_SECRET = "dummy_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "dummy_webhook";
});
const gateway = vi.hoisted(() => ({ calls: 0, delayMs: 0, fail: false as boolean | ((n: number) => boolean) }));
vi.mock("@/lib/payments/razorpay", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/razorpay")>();
  return {
    ...real,
    createRazorpayOrder: vi.fn(async (args: { amount: number; receipt: string; orderId: string }) => {
      const n = ++gateway.calls;
      await new Promise((r) => setTimeout(r, gateway.delayMs));
      if (typeof gateway.fail === "function" ? gateway.fail(n) : gateway.fail) throw new Error("Razorpay /orders failed (504): timeout");
      return { id: `order_test_${n}_${args.orderId.slice(0, 8)}`, amount: args.amount, currency: "INR", receipt: args.receipt, status: "created" };
    }),
  };
});

import { addDays, istDateString, NO_SLOT_LABEL, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { placeOrder, customerCancel, getOrderById } from "@/lib/orders";
import { processPaymentEvent } from "@/lib/payments/process";
import { preparePayment } from "@/lib/payments/start";
import { ApiError, isDefiniteRejection } from "@/lib/client/api";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const today = istDateString(new Date());
const tomorrow = addDays(today, 1);
let slot = "";
let tomato = "";
let n = 0;

const address = { label: "Home", fullName: "Integrity Tester", phone: "9876543210", city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false };
const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: tomato, quantity: 4 }],
    address: { ...address, line1: `Integrity lane ${++n}, ${randomUUID().slice(0, 6)}` },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "razorpay",
    idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;

const makeSlot = async (capacity: number) =>
  (await queryOne<{ id: string }>(
    "insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity) values ($1, '18:00', '20:00', 0, $2) returning id",
    [`I${randomUUID().slice(0, 6)}`, capacity],
  ))!.id;

async function expire(orderId: string) {
  await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [orderId]);
  await query("select release_expired_reservations()");
  expect((await getOrderById(orderId))!.status).toBe("cancelled");
}
const pay = (orderId: string, amount: number, id = randomUUID().slice(0, 12)) =>
  processPaymentEvent({ provider: "razorpay", eventId: `evt_${id}`, type: "payment.captured", rawType: "payment.captured", providerOrderId: null, paymentId: `pay_${id}`, amount, orderId, payload: {} });
const stockOf = async (id: string) => (await queryOne<{ stock: number }>("select stock from product_variants where id = $1", [id]))!.stock;
const lastNote = async (orderId: string) => (await getOrderById(orderId))!.events.at(-1)!.note ?? "";

beforeAll(async () => {
  tomato = (await queryOne<{ id: string }>(
    "select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'",
  ))!.id;
  slot = await makeSlot(1000);
  await query("update products set stock_grams = 1000000 where slug = 'tomato'");
});
beforeEach(() => {
  gateway.calls = 0;
  gateway.delayMs = 0;
  gateway.fail = false;
});
afterAll(async () => {
  await pool.end();
});

describe("1. checkout retry after a cancelled attempt", () => {
  it("failed preparation cancels → same-key retry gets ORDER_CANCELLED (no fake success) → a new key places a new order", async () => {
    const attempt = input();
    const { order } = await placeOrder(CUSTOMER, attempt);
    gateway.fail = true;
    const prepErr = await preparePayment(order).catch((e) => e);
    expect(prepErr).toMatchObject({ status: 502, code: "ORDER_CANCELLED" });
    expect((await getOrderById(order.id))!.status).toBe("cancelled");

    // Same key (e.g. the client retried after the 502): explicit conflict, not the cancelled order as success.
    await expect(placeOrder(CUSTOMER, attempt)).rejects.toMatchObject({ status: 409, code: "ORDER_CANCELLED", details: { orderId: order.id } });
    // Identical resubmit with a new key within 2 minutes isn't merged into the cancelled order either.
    gateway.fail = false;
    const retry = await placeOrder(CUSTOMER, { ...attempt, idempotencyKey: randomUUID() });
    expect(retry.created).toBe(true);
    expect(retry.order.id).not.toBe(order.id);
    expect(await preparePayment(retry.order)).toMatchObject({ provider: "razorpay" });
  });

  it("clients rotate the idempotency key only for definite rejections", () => {
    expect(isDefiniteRejection(new ApiError(409, "x", "ORDER_CANCELLED"))).toBe(true);
    expect(isDefiniteRejection(new ApiError(502, "x", "ORDER_CANCELLED"))).toBe(true);
    expect(isDefiniteRejection(new ApiError(409, "slot full", "ORDER_REJECTED"))).toBe(true);
    expect(isDefiniteRejection(new ApiError(0, "offline"))).toBe(false); // network error: keep the key
    expect(isDefiniteRejection(new ApiError(502, "gateway"))).toBe(false); // ambiguous 5xx: keep
    expect(isDefiniteRejection(new ApiError(504, "timeout"))).toBe(false);
    expect(isDefiniteRejection(new ApiError(429, "slow down"))).toBe(false);
    expect(isDefiniteRejection(new Error("x"))).toBe(false);
  });
});

describe("2. Razorpay preparation is coordinated in the database", () => {
  it("parallel calls create ONE gateway order and all return it", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    gateway.delayMs = 150;
    const res = await Promise.all(Array.from({ length: 5 }, () => preparePayment(order)));
    expect(gateway.calls).toBe(1);
    const ids = new Set(res.map((r) => (r?.provider === "razorpay" ? r.razorpayOrderId : null)));
    expect(ids.size).toBe(1);
    expect((await queryOne<{ id: string }>("select razorpay_order_id as id from orders where id = $1", [order.id]))!.id).toBe([...ids][0]);
  });

  it("one call succeeds and another would fail: the order is NOT cancelled; the others reuse the gateway order", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    gateway.delayMs = 100;
    gateway.fail = (k) => k > 1;
    const res = await Promise.allSettled([preparePayment(order), preparePayment(order), preparePayment(order)]);
    expect(res.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(gateway.calls).toBe(1);
    expect((await getOrderById(order.id))!.status).toBe("pending_payment");
  });

  it("a gateway failure after the payment was captured doesn't cancel; it reports nothing to pay", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    gateway.fail = true;
    gateway.delayMs = 200;
    const prep = preparePayment(order);
    await new Promise((r) => setTimeout(r, 50));
    expect(await pay(order.id, order.total)).toBe("paid");
    await expect(prep).resolves.toBeUndefined();
    expect(await getOrderById(order.id)).toMatchObject({ status: "placed", paymentStatus: "paid" });
  });

  it("preparation racing a customer cancellation never hands out a payable gateway order", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    gateway.delayMs = 200;
    const prep = preparePayment(order);
    await new Promise((r) => setTimeout(r, 50));
    await customerCancel(CUSTOMER, order.id);
    await expect(prep).resolves.toBeUndefined();
    expect((await queryOne<{ id: string | null }>("select razorpay_order_id as id from orders where id = $1", [order.id]))!.id).toBeNull();
    expect((await getOrderById(order.id))!.status).toBe("cancelled");
  });

  it("no database connection is held while Razorpay answers", async () => {
    const orders = await Promise.all([1, 2, 3, 4, 5, 6].map(async () => (await placeOrder(CUSTOMER, input())).order));
    gateway.delayMs = 400;
    const preps = Promise.all(orders.map((o) => preparePayment(o)));
    await new Promise((r) => setTimeout(r, 200)); // all six are inside the gateway call now
    expect(pool.totalCount - pool.idleCount).toBe(0); // nothing checked out of the pool
    expect(pool.waitingCount).toBe(0);
    const res = await preps;
    expect(res.every((r) => r?.provider === "razorpay")).toBe(true);
    expect(gateway.calls).toBe(6);
  });

  it("a stale claim left by a request that died is taken over; a fresh one is waited for", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await query("update orders set payment_prep_token = $2, payment_prep_at = now() - interval '2 minutes' where id = $1", [order.id, randomUUID()]);
    expect(await preparePayment(order)).toMatchObject({ provider: "razorpay" });
    expect(gateway.calls).toBe(1);

    const { order: o2 } = await placeOrder(CUSTOMER, input());
    await query("update orders set payment_prep_token = $2, payment_prep_at = now() where id = $1", [o2.id, randomUUID()]);
    const waiting = preparePayment(o2);
    await new Promise((r) => setTimeout(r, 400));
    await query("update orders set razorpay_order_id = 'order_other_instance', payment_prep_token = null where id = $1", [o2.id]);
    await expect(waiting).resolves.toMatchObject({ razorpayOrderId: "order_other_instance" });
    expect(gateway.calls).toBe(1); // the waiter reused the other instance's gateway order
  });

  it("an expired order is never prepared", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await expire(order.id);
    await expect(preparePayment(order)).resolves.toBeUndefined();
    expect(gateway.calls).toBe(0);
  });
});

describe("3. late payment: slot checked in the same transaction", () => {
  it.each([
    ["full", async (s: string, o: { id: string }) => { await query("update delivery_slots set capacity = 1 where id = $1", [s]); await placeOrder(CUSTOMER, input({ slotId: s, paymentMethod: "cod" })); void o; }, /slot was full/],
    ["inactive", async (s: string) => { await query("update delivery_slots set active = false where id = $1", [s]); }, /no longer offered/],
    ["closed (cutoff passed)", async (s: string, o: { id: string }) => { await query("update orders set delivery_date = $2 where id = $1", [o.id, today]); await query("update delivery_slots set start_time = '00:00', end_time = '00:30' where id = $1", [s]); }, /had closed/],
    ["in the past", async (_s: string, o: { id: string }) => { await query("update orders set delivery_date = $2 where id = $1", [o.id, addDays(today, -1)]); }, /date had passed/],
  ])("slot %s → revived atomically without the slot (keeping a future day) and an explanatory event", async (name, breakIt, note) => {
    const s = await makeSlot(5);
    const { order } = await placeOrder(CUSTOMER, input({ slotId: s }));
    await expire(order.id);
    await breakIt(s, order);
    const before = await stockOf(tomato);
    expect(await pay(order.id, order.total)).toBe("paid_late");
    const o = (await getOrderById(order.id))!;
    // The chosen day is kept when it's still ahead (full / switched-off slot); a past or closed day becomes today.
    const expectedDate = name === "full" || name === "inactive" ? tomorrow : today;
    expect(o).toMatchObject({ status: "placed", paymentStatus: "paid", slotLabel: NO_SLOT_LABEL, deliveryDate: expectedDate });
    expect((await queryOne<{ slot_id: string | null }>("select slot_id from orders where id = $1", [order.id]))!.slot_id).toBeNull();
    expect(await lastNote(order.id)).toMatch(note);
    expect(await stockOf(tomato)).toBe(before - 4);
  });

  it("a late payment racing a checkout for the last place never overfills the slot", async () => {
    for (let round = 0; round < 6; round++) {
      const s = await makeSlot(1);
      const { order } = await placeOrder(CUSTOMER, input({ slotId: s }));
      await expire(order.id);
      const [late, checkout] = await Promise.allSettled([pay(order.id, order.total), placeOrder(CUSTOMER, input({ slotId: s, paymentMethod: "cod" }))]);
      expect(late).toMatchObject({ status: "fulfilled", value: "paid_late" });
      const inSlot = (await queryOne<{ n: number }>("select count(*)::int as n from orders where slot_id = $1 and status <> 'cancelled'", [s]))!.n;
      expect(inSlot).toBe(1);
      const keptSlot = (await queryOne<{ slot_id: string | null }>("select slot_id from orders where id = $1", [order.id]))!.slot_id === s;
      expect(keptSlot).toBe(checkout.status === "rejected"); // exactly one of them holds the place
    }
  });
});

describe("4. late payment: coupon limits", () => {
  it("coupon limit consumed by another order meanwhile → stays cancelled, refund flagged, no stock or coupon change", async () => {
    const code = `L${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const couponId = (await queryOne<{ id: string }>(
      "insert into coupons (code, kind, value, usage_limit) values ($1, 'flat', 1000, 1) returning id",
      [code],
    ))!.id;
    const { order } = await placeOrder(CUSTOMER, input({ couponCode: code }));
    expect(order.discount).toBe(1000);
    await expire(order.id); // its redemption is removed → the coupon is free again
    await placeOrder(CUSTOMER, input({ couponCode: code, paymentMethod: "cod" })); // someone uses it
    const before = await stockOf(tomato);

    expect(await pay(order.id, order.total)).toBe("refund_required");
    expect(await getOrderById(order.id)).toMatchObject({ status: "cancelled", paymentStatus: "refund_pending", total: order.total });
    expect(await lastNote(order.id)).toMatch(/usage limit/);
    expect(await stockOf(tomato)).toBe(before);
    expect(await queryOne("select used_count from coupons where id = $1", [couponId])).toEqual({ used_count: 1 });
    expect((await queryOne<{ n: number }>("select count(*)::int as n from coupon_redemptions where coupon_id = $1", [couponId]))!.n).toBe(1);
  });

  it("a coupon deactivated meanwhile also blocks revival; a still-valid one is re-redeemed once", async () => {
    const code = `D${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const couponId = (await queryOne<{ id: string }>("insert into coupons (code, kind, value, usage_limit) values ($1, 'flat', 500, 5) returning id", [code]))!.id;
    const { order: a } = await placeOrder(CUSTOMER, input({ couponCode: code }));
    const { order: b } = await placeOrder(CUSTOMER, input({ couponCode: code }));
    await expire(a.id);
    await expire(b.id);
    expect(await pay(a.id, a.total)).toBe("paid_late"); // still valid → revived, redeemed once
    expect(await queryOne("select used_count from coupons where id = $1", [couponId])).toEqual({ used_count: 1 });
    await query("update coupons set active = false where id = $1", [couponId]);
    expect(await pay(b.id, b.total)).toBe("refund_required");
    expect(await lastNote(b.id)).toMatch(/no longer valid/);
    expect(await queryOne("select used_count from coupons where id = $1", [couponId])).toEqual({ used_count: 1 });
  });
});

describe("5. late payment: product, variant and category must still be sellable", () => {
  async function freshProduct() {
    const cat = (await queryOne<{ id: string }>("insert into categories (slug, name) values ($1, 'Test cat') returning id", [`c-${randomUUID().slice(0, 8)}`]))!.id;
    const prod = (await queryOne<{ id: string }>("insert into products (slug, name, category_id) values ($1, 'Test veg', $2) returning id", [`p-${randomUUID().slice(0, 8)}`, cat]))!.id;
    const variant = (await queryOne<{ id: string }>("insert into product_variants (product_id, label, price, stock) values ($1, '1 bunch', 5000, 100) returning id", [prod]))!.id;
    return { cat, prod, variant };
  }
  it.each([
    ["product deactivated", (x: { prod: string }) => query("update products set active = false where id = $1", [x.prod])],
    ["category deactivated", (x: { cat: string }) => query("update categories set active = false where id = $1", [x.cat])],
    ["size (variant) deactivated", (x: { variant: string }) => query("update product_variants set active = false where id = $1", [x.variant])],
    ["size (variant) deleted", (x: { variant: string }) => query("delete from product_variants where id = $1", [x.variant])],
  ])("%s → stays cancelled, refund flagged, no stock taken for any item", async (_name, breakIt) => {
    const x = await freshProduct();
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: tomato, quantity: 2 }, { variantId: x.variant, quantity: 1 }] }));
    await expire(order.id);
    await breakIt(x as never);
    const before = await stockOf(tomato);
    expect(await pay(order.id, order.total)).toBe("refund_required");
    expect(await getOrderById(order.id)).toMatchObject({ status: "cancelled", paymentStatus: "refund_pending" });
    expect(await lastNote(order.id)).toMatch(/no longer available/);
    expect(await stockOf(tomato)).toBe(before); // the other (still available) item wasn't taken either
  });
});

describe("duplicate webhook deliveries", () => {
  it("a late payment delivered twice re-takes stock and re-redeems the coupon only once", async () => {
    const code = `W${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const couponId = (await queryOne<{ id: string }>("insert into coupons (code, kind, value, usage_limit) values ($1, 'flat', 500, 10) returning id", [code]))!.id;
    const { order } = await placeOrder(CUSTOMER, input({ couponCode: code }));
    await expire(order.id);
    const before = await stockOf(tomato);
    const id = randomUUID().slice(0, 12);
    const results = await Promise.all([pay(order.id, order.total, id), pay(order.id, order.total, id), pay(order.id, order.total, id)]);
    expect(results.filter((r) => r === "paid_late")).toHaveLength(1);
    expect(await stockOf(tomato)).toBe(before - 4);
    expect(await queryOne("select used_count from coupons where id = $1", [couponId])).toEqual({ used_count: 1 });
    expect((await queryOne<{ n: number }>("select count(*)::int as n from payments where order_id = $1", [order.id]))!.n).toBe(1);
    // A redelivery of the same event: duplicate. A second, DIFFERENT payment later is flagged
    // for refund (duplicate_payment); stock, coupon and order stay as they are.
    expect(await pay(order.id, order.total, id)).toBe("duplicate");
    expect(await pay(order.id, order.total)).toBe("duplicate_payment");
    expect(await stockOf(tomato)).toBe(before - 4);
    expect(await queryOne("select used_count from coupons where id = $1", [couponId])).toEqual({ used_count: 1 });
    expect(await stockOf(tomato)).toBe(before - 4);
  });
});
