/**
 * Regression tests for: admin promotion via verified identity only, profile field lockdown, late
 * payments that can no longer be delivered, customer cancellation racing staff, and concurrent
 * Razorpay payment preparation. Runs against the isolated test database (see vitest.config.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Razorpay "configured" for this file only (keys are fake; the gateway call itself is mocked below).
vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
  process.env.RAZORPAY_KEY_SECRET = "dummy_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "dummy_webhook";
});

const gateway = vi.hoisted(() => ({
  calls: 0,
  delayMs: 0,
  fail: false as boolean | ((n: number) => boolean),
}));
vi.mock("@/lib/payments/razorpay", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/razorpay")>();
  return {
    ...real,
    createRazorpayOrder: vi.fn(async (args: { amount: number; receipt: string; orderId: string }) => {
      const n = ++gateway.calls;
      await new Promise((r) => setTimeout(r, gateway.delayMs));
      const fail = typeof gateway.fail === "function" ? gateway.fail(n) : gateway.fail;
      if (fail) throw new Error("Razorpay /orders failed (504): timeout");
      return { id: `order_test_${n}_${args.orderId.slice(0, 8)}`, amount: args.amount, currency: "INR", receipt: args.receipt, status: "created" };
    }),
  };
});

import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne, asUser } from "@/lib/db";
import { placeOrder, customerCancel, getOrderById } from "@/lib/orders";
import { processPaymentEvent } from "@/lib/payments/process";
import { preparePayment } from "@/lib/payments/start";
import { adminUpdateOrderStatus } from "@/lib/admin/orders";
import { promoteVerifiedAdmins } from "../scripts/admin-bootstrap.mjs";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const today = istDateString(new Date());
const tomorrow = addDays(today, 1);
let slot = "";
let variant = "";
let n = 0;

const address = { label: "Home", fullName: "Race Tester", phone: "9876543210", city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false };
const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: variant, quantity: 4 }],
    address: { ...address, line1: `Race lane ${++n}, ${randomUUID().slice(0, 6)}` },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod",
    idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;

async function makeSlot(capacity: number, start = "18:00", end = "20:00", cutoff = 0) {
  return (await queryOne<{ id: string }>(
    "insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity) values ($1, $2, $3, $4, $5) returning id",
    [`T${randomUUID().slice(0, 6)}`, start, end, cutoff, capacity],
  ))!.id;
}

/** A prepaid (test-payment) order whose reservation then expires: stock released, status cancelled. */
async function expiredPrepaidOrder(o: Partial<PlaceOrderInput> = {}) {
  const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "razorpay", ...o }));
  await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
  await query("select release_expired_reservations()");
  expect((await getOrderById(order.id))!.status).toBe("cancelled");
  return order;
}
const pay = (orderId: string, amount: number, id = randomUUID().slice(0, 12)) =>
  processPaymentEvent({ provider: "razorpay", eventId: `evt_${id}`, type: "payment.captured", rawType: "payment.captured", providerOrderId: null, paymentId: `pay_${id}`, amount, orderId, payload: {} });
const stockOf = async (id: string) => (await queryOne<{ stock: number }>("select stock from product_variants where id = $1", [id]))!.stock;

beforeAll(async () => {
  variant = (await queryOne<{ id: string }>(
    "select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'",
  ))!.id;
  slot = await makeSlot(1000);
  await query("update store_settings set cod_enabled = true");
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

describe("1. admin promotion uses a verified Supabase Auth identity", () => {
  it("customers can't change their profile email (only name/phone) through the database API", async () => {
    const original = await queryOne<{ full_name: string | null; phone: string | null }>("select full_name, phone from profiles where id = $1", [CUSTOMER]);
    try {
    await asUser(CUSTOMER, (c) => c.query("update profiles set full_name = 'Renamed', phone = '9000000009' where id = auth.uid()"));
    expect(await queryOne("select full_name, phone from profiles where id = $1", [CUSTOMER])).toEqual({ full_name: "Renamed", phone: "9000000009" });
    await expect(asUser(CUSTOMER, (c) => c.query("update profiles set email = 'owner@shop.example' where id = auth.uid()"))).rejects.toThrow(/permission denied/);
    await expect(asUser(CUSTOMER, (c) => c.query("update profiles set role = 'admin' where id = auth.uid()"))).rejects.toThrow(/permission denied/);
    } finally {
      await query("update profiles set full_name = $2, phone = $3 where id = $1", [CUSTOMER, original!.full_name, original!.phone]);
    }
  });

  it("promotes only a confirmed auth.users account matched by id — not a spoofed profile email or an unconfirmed sign-up", async () => {
    const owner = "owner-" + randomUUID().slice(0, 6) + "@shop.example";
    const late = "late-" + randomUUID().slice(0, 6) + "@shop.example";
    const ownerId = (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [owner]))!.id;
    const lateId = (await queryOne<{ id: string }>("insert into auth.users (email) values ($1) returning id", [late]))!.id;
    const spoofId = (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [`spoof-${randomUUID().slice(0, 6)}@x.example`]))!.id;
    for (const id of [ownerId, lateId, spoofId]) await query("insert into profiles (id, email) values ($1, (select email from auth.users where id = $1)) on conflict do nothing", [id]);
    // Old data: a customer profile carrying the owner's address (possible before the lockdown).
    await query("update profiles set email = $2 where id = $1", [spoofId, owner]);

    const client = await pool.connect();
    try {
      const r = await promoteVerifiedAdmins(client, [owner.toUpperCase(), late]);
      expect(r.promoted).toEqual([owner]);
      expect(r.waitingForConfirmation).toEqual([late]);
    } finally {
      client.release();
    }
    const roles = await query<{ id: string; role: string }>("select id, role from profiles where id = any($1::uuid[])", [[ownerId, lateId, spoofId]]);
    expect(Object.fromEntries(roles.map((x) => [x.id, x.role]))).toEqual({ [ownerId]: "admin", [lateId]: "customer", [spoofId]: "customer" });
    // ...and the unconfirmed sign-up was NOT confirmed by the bootstrap.
    expect((await queryOne<{ c: Date | null }>("select email_confirmed_at as c from auth.users where id = $1", [lateId]))!.c).toBeNull();
    // Leave the shared test database as it was for the other test files.
    await query("delete from profiles where id = any($1::uuid[])", [[ownerId, lateId, spoofId]]);
    await query("delete from auth.users where id = any($1::uuid[])", [[ownerId, lateId, spoofId]]);
  });
});

describe("2. a late payment revives an order only if it can still be delivered", () => {
  it("still revives when date, slot, cutoff and capacity are fine", async () => {
    const order = await expiredPrepaidOrder();
    const before = await stockOf(variant);
    expect(await pay(order.id, order.total)).toBe("paid_late");
    expect(await getOrderById(order.id)).toMatchObject({ status: "placed", paymentStatus: "paid" });
    expect(await stockOf(variant)).toBe(before - 4);
  });

  it.each([
    ["slot full", async (o: { id: string }) => { const s = (await queryOne<{ slot_id: string }>("select slot_id from orders where id = $1", [o.id]))!.slot_id; await query("update delivery_slots set capacity = 1 where id = $1", [s]); await placeOrder(CUSTOMER, input({ slotId: s })); }, /full/],
    ["slot switched off", async (o: { id: string }) => { await query("update delivery_slots set active = false where id = (select slot_id from orders where id = $1)", [o.id]); }, /no longer offered/],
    ["slot cutoff passed", async (o: { id: string }) => { await query("update orders set delivery_date = $2 where id = $1", [o.id, today]); await query("update delivery_slots set start_time = '00:00', end_time = '00:30' where id = (select slot_id from orders where id = $1)", [o.id]); }, /closed/],
    ["delivery date passed", async (o: { id: string }) => { await query("update orders set delivery_date = $2 where id = $1", [o.id, addDays(today, -1)]); }, /date has passed/],
  ])("keeps the order cancelled and flags a refund when the %s", async (_name, breakIt, note) => {
    const own = await makeSlot(5);
    const order = await expiredPrepaidOrder({ slotId: own });
    await breakIt(order);
    const before = await stockOf(variant);
    expect(await pay(order.id, order.total)).toBe("refund_required");
    const o = (await getOrderById(order.id))!;
    expect(o).toMatchObject({ status: "cancelled", paymentStatus: "refund_pending" });
    expect(o.events.at(-1)!.note).toMatch(note);
    expect(await stockOf(variant)).toBe(before); // nothing re-reserved
    // Webhook retries stay idempotent.
    const [{ n: payments }] = await query<{ n: number }>("select count(*)::int as n from payments where order_id = $1", [order.id]);
    expect(payments).toBe(1);
    expect(await pay(order.id, order.total)).toBe("already_processed");
  });

  it("a late payment and a checkout racing for the last place in a slot never overfill it", async () => {
    for (let round = 0; round < 5; round++) {
      const s = await makeSlot(1);
      const order = await expiredPrepaidOrder({ slotId: s }); // cancelled → slot has 1 free place
      const [late, checkout] = await Promise.allSettled([pay(order.id, order.total), placeOrder(CUSTOMER, input({ slotId: s }))]);
      const booked = (await queryOne<{ n: number }>("select count(*)::int as n from orders where slot_id = $1 and status <> 'cancelled'", [s]))!.n;
      expect(booked).toBe(1);
      const lateWon = late.status === "fulfilled" && late.value === "paid_late";
      expect(lateWon).toBe(checkout.status === "rejected");
    }
  });
});

describe("3. customer cancellation is checked under the order lock", () => {
  it("only the owner can cancel, and never once packed", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await expect(customerCancel(ADMIN, order.id)).rejects.toMatchObject({ status: 404 }); // not theirs
    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    await expect(customerCancel(CUSTOMER, order.id)).rejects.toMatchObject({ status: 409 });
    expect((await getOrderById(order.id))!.status).toBe("packed");
    // Staff keep their wider rules: they may still cancel a packed order.
    await adminUpdateOrderStatus(order.id, "cancelled", ADMIN);
    expect((await getOrderById(order.id))!.status).toBe("cancelled");
  });

  it("racing a staff 'packed' update: exactly one wins and a packed order is never cancelled by the customer", async () => {
    for (let round = 0; round < 8; round++) {
      const { order } = await placeOrder(CUSTOMER, input());
      const [cancel, pack] = await Promise.allSettled([customerCancel(CUSTOMER, order.id), adminUpdateOrderStatus(order.id, "packed", ADMIN)]);
      const final = (await getOrderById(order.id))!.status;
      expect([cancel.status, pack.status].filter((s) => s === "fulfilled")).toHaveLength(1);
      expect(final).toBe(cancel.status === "fulfilled" ? "cancelled" : "packed");
    }
  });
});

describe("4. Razorpay payment preparation is serialised per order", () => {
  it("parallel requests create ONE gateway order and all get the same id", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "razorpay" }));
    gateway.delayMs = 150;
    const res = await Promise.all(Array.from({ length: 5 }, () => preparePayment(order)));
    expect(gateway.calls).toBe(1);
    const ids = new Set(res.map((r) => (r && r.provider === "razorpay" ? r.razorpayOrderId : null)));
    expect(ids.size).toBe(1);
    expect((await queryOne<{ id: string }>("select razorpay_order_id as id from orders where id = $1", [order.id]))!.id).toBe([...ids][0]);
  });

  it("a failing request does not cancel an order that already has a gateway order (retry reuses it)", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "razorpay" }));
    gateway.delayMs = 100;
    gateway.fail = (k) => k > 1; // only the first gateway call succeeds
    const res = await Promise.allSettled([preparePayment(order), preparePayment(order), preparePayment(order)]);
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    expect(gateway.calls).toBe(1); // the others reused the saved gateway order
    expect((await getOrderById(order.id))!.status).toBe("pending_payment");
  });

  it("a gateway failure cancels only an order with no gateway order and no captured payment", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "razorpay" }));
    gateway.fail = true;
    await expect(preparePayment(order)).rejects.toMatchObject({ status: 502 });
    expect((await getOrderById(order.id))!.status).toBe("cancelled");

    // Payment captured while the gateway call was failing: the order is paid, not cancelled.
    const { order: o2 } = await placeOrder(CUSTOMER, input({ paymentMethod: "razorpay" }));
    gateway.delayMs = 200;
    const prep = preparePayment(o2);
    await new Promise((r) => setTimeout(r, 50));
    expect(await pay(o2.id, o2.total)).toBe("paid");
    await expect(prep).resolves.toBeUndefined(); // nothing left to pay
    expect(await getOrderById(o2.id)).toMatchObject({ status: "placed", paymentStatus: "paid" });
  });

  it("an order cancelled while Razorpay answers is not handed a payable gateway order", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "razorpay" }));
    gateway.delayMs = 200;
    const prep = preparePayment(order);
    await new Promise((r) => setTimeout(r, 50));
    await customerCancel(CUSTOMER, order.id);
    await expect(prep).resolves.toBeUndefined();
    expect((await queryOne<{ id: string | null }>("select razorpay_order_id as id from orders where id = $1", [order.id]))!.id).toBeNull();
  });
});
