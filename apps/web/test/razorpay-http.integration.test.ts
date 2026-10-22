/**
 * Razorpay end to end at the HTTP layer: the real webhook and verify routes, signed exactly as
 * Razorpay signs them (HMAC-SHA256 with test secrets). No network: creating the gateway order and
 * fetching/capturing a payment are mocked. Runs on the isolated test database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";

vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
  process.env.RAZORPAY_KEY_SECRET = "dummy_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "dummy_webhook";
});
const KEY_SECRET = "dummy_secret";
const WEBHOOK_SECRET = "dummy_webhook";

// Route handlers read the session from Next's request headers/cookies: none here (signed out).
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));
const gw = vi.hoisted(() => ({ payment: null as null | Record<string, unknown>, captures: 0 }));
vi.mock("@/lib/payments/razorpay", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/razorpay")>();
  return {
    ...real,
    createRazorpayOrder: vi.fn(async (a: { amount: number; orderId: string }) => ({ id: `order_${a.orderId.slice(0, 8)}${randomUUID().slice(0, 4)}`, amount: a.amount, currency: "INR", receipt: "r", status: "created" })),
    fetchPayment: vi.fn(async () => gw.payment),
    capturePayment: vi.fn(async () => { gw.captures++; return { ...gw.payment, status: "captured" }; }),
  };
});

import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { placeOrder, getOrderById, customerCancel } from "@/lib/orders";
import { payToken } from "@/lib/tokens";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as verify } from "@/app/api/payments/razorpay/verify/route";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c2";
let slot = "";
let tomato = "";

const input = (): PlaceOrderInput => ({
  items: [{ variantId: tomato, quantity: 4 }],
  address: { label: "Home", fullName: "Webhook Tester", phone: "9876543210", line1: `Hook lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
  saveAddress: false, slotId: slot, deliveryDate: addDays(istDateString(new Date()), 1), paymentMethod: "razorpay",
  idempotencyKey: randomUUID(), couponCode: null, customerNote: null, unavailableItems: "call", whatsappUpdates: false,
}) as PlaceOrderInput;

async function newOrder() {
  const { order } = await placeOrder(CUSTOMER, input());
  const { preparePayment } = await import("@/lib/payments/start");
  await preparePayment((await getOrderById(order.id))!);
  const row = (await queryOne<{ razorpay_order_id: string; total: number }>("select razorpay_order_id, total from orders where id = $1", [order.id]))!;
  return { id: order.id, rzp: row.razorpay_order_id, total: row.total };
}

const sign = (raw: string, secret = WEBHOOK_SECRET) => createHmac("sha256", secret).update(raw).digest("hex");
async function sendWebhook(body: unknown, opts: { eventId?: string; signature?: string | null; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = opts.signature === undefined ? sign(raw) : opts.signature;
  if (sig !== null) headers["x-razorpay-signature"] = sig;
  if (opts.eventId) headers["x-razorpay-event-id"] = opts.eventId;
  const res = await webhook(new Request("http://localhost/api/webhooks/razorpay", { method: "POST", headers, body: raw }));
  return { status: res.status, body: (await res.json()) as { result?: string; error?: string } };
}
const captured = (rzp: string, amount: number, payId = `pay_${randomUUID().slice(0, 10)}`, event = "payment.captured") => ({
  event,
  payload: { payment: { entity: { id: payId, order_id: rzp, amount, currency: "INR", status: event === "payment.failed" ? "failed" : "captured" } } },
});
const state = async (id: string) => (await queryOne<{ status: string; payment_status: string }>("select status, payment_status from orders where id = $1", [id]))!;

async function callVerify(orderId: string, body: Record<string, unknown>, token: string | null = payToken.issue(orderId)) {
  const url = `http://localhost/api/payments/razorpay/verify${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  const res = await verify(new Request(url, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ orderId, ...body }) }), { params: Promise.resolve({}) } as never);
  return { status: res.status, body: (await res.json()) as { status?: string; error?: string } };
}

beforeAll(async () => {
  await query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'webhook-tester@test.local', now()) on conflict do nothing", [CUSTOMER]);
  tomato = (await queryOne<{ id: string }>("select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'"))!.id;
  await query("update products set stock_grams = 1000000 where slug = 'tomato'");
  slot = (await queryOne<{ id: string }>("insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity) values ($1, '18:00', '20:00', 0, 1000) returning id", [`W${randomUUID().slice(0, 6)}`]))!.id;
});
beforeEach(() => { gw.payment = null; gw.captures = 0; });
afterAll(async () => { await pool.end(); });

describe("webhook signature", () => {
  it("missing, wrong-secret or tampered signatures are rejected and change nothing", async () => {
    const o = await newOrder();
    const body = captured(o.rzp, o.total);
    expect((await sendWebhook(body, { signature: null })).status).toBe(400);
    expect((await sendWebhook(body, { signature: sign(JSON.stringify(body), "wrong") })).status).toBe(400);
    const tampered = JSON.stringify(captured(o.rzp, o.total));
    expect((await sendWebhook(null, { raw: tampered.replace(String(o.total), String(o.total + 1)), signature: sign(tampered) })).status).toBe(400);
    expect(await state(o.id)).toEqual({ status: "pending_payment", payment_status: "pending" });
  });
});

describe("webhook events", () => {
  it("captured with the right amount → paid; redelivery → duplicate; order.paid for it → already processed", async () => {
    const o = await newOrder();
    const payId = `pay_${randomUUID().slice(0, 10)}`;
    const evt = `evt_${randomUUID().slice(0, 8)}`;
    expect((await sendWebhook(captured(o.rzp, o.total, payId), { eventId: evt })).body.result).toBe("paid");
    expect(await state(o.id)).toEqual({ status: "placed", payment_status: "paid" });
    expect((await sendWebhook(captured(o.rzp, o.total, payId), { eventId: evt })).body.result).toBe("duplicate");
    expect((await sendWebhook(captured(o.rzp, o.total, payId, "order.paid"), { eventId: `${evt}b` })).body.result).toBe("already_processed");
    expect((await queryOne<{ n: number }>("select count(*)::int n from payments where order_id = $1", [o.id]))!.n).toBe(1);
  });

  it("a wrong amount is never marked paid", async () => {
    const o = await newOrder();
    expect((await sendWebhook(captured(o.rzp, o.total - 100))).body.result).toBe("amount_mismatch");
    expect(await state(o.id)).toEqual({ status: "pending_payment", payment_status: "pending" });
  });

  it("payment.failed is only recorded; the customer can still pay", async () => {
    const o = await newOrder();
    expect((await sendWebhook(captured(o.rzp, o.total, undefined, "payment.failed"))).body.result).toBe("failed_recorded");
    expect(await state(o.id)).toEqual({ status: "pending_payment", payment_status: "pending" });
    expect((await sendWebhook(captured(o.rzp, o.total))).body.result).toBe("paid");
  });

  it("unknown gateway order → order_not_found; other events ignored; bad JSON with a valid signature → 400", async () => {
    expect((await sendWebhook(captured("order_unknown123", 100))).body.result).toBe("order_not_found");
    expect((await sendWebhook({ event: "refund.created", payload: {} })).body.result).toBe("ignored");
    expect((await sendWebhook(null, { raw: "{not json" })).status).toBe(400);
  });

  it("paid after the reservation expired → re-reserved (paid_late); after the customer cancelled → refund flagged", async () => {
    const late = await newOrder();
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [late.id]);
    await query("select release_expired_reservations()");
    expect((await state(late.id)).status).toBe("cancelled");
    expect((await sendWebhook(captured(late.rzp, late.total))).body.result).toBe("paid_late");
    expect(await state(late.id)).toEqual({ status: "placed", payment_status: "paid" });

    const cancelled = await newOrder();
    await customerCancel(CUSTOMER, cancelled.id);
    expect((await sendWebhook(captured(cancelled.rzp, cancelled.total))).body.result).toBe("refund_required");
    expect(await state(cancelled.id)).toEqual({ status: "cancelled", payment_status: "refund_pending" });
  });

  it("payment links: only a fully paid link whose amount matches marks the order paid", async () => {
    const o = await newOrder();
    const link = `plink_${randomUUID().slice(0, 8)}`;
    await query("update orders set payment_method = 'razorpay_link', razorpay_payment_link_id = $2, razorpay_order_id = null where id = $1", [o.id, link]);
    const ev = (amountPaid: number, status = "paid") => ({
      event: "payment_link.paid",
      payload: {
        payment: { entity: { id: `pay_${randomUUID().slice(0, 10)}`, order_id: "order_link_x", amount: amountPaid, currency: "INR", status: "captured" } },
        payment_link: { entity: { id: link, reference_id: "X", amount_paid: amountPaid, status } },
      },
    });
    expect((await sendWebhook(ev(o.total, "partially_paid"))).body.result).toBe("ignored");
    expect((await sendWebhook(ev(o.total - 1))).body.result).toBe("amount_mismatch");
    expect((await state(o.id)).payment_status).toBe("pending");
    expect((await sendWebhook(ev(o.total))).body.result).toBe("paid");
  });
});

describe("checkout verify route", () => {
  const sig = (rzp: string, pay: string) => createHmac("sha256", KEY_SECRET).update(`${rzp}|${pay}`).digest("hex");

  it("forged signature, another order's gateway id, or no access → refused, order unchanged", async () => {
    const o = await newOrder();
    const other = await newOrder();
    const pay = "pay_forged12345";
    expect((await callVerify(o.id, { razorpay_order_id: o.rzp, razorpay_payment_id: pay, razorpay_signature: "f".repeat(64) })).status).toBe(400);
    expect((await callVerify(o.id, { razorpay_order_id: other.rzp, razorpay_payment_id: pay, razorpay_signature: sig(other.rzp, pay) })).status).toBe(400);
    expect((await callVerify(o.id, { razorpay_order_id: o.rzp, razorpay_payment_id: pay, razorpay_signature: sig(o.rzp, pay) }, null)).status).toBe(403);
    expect((await callVerify(o.id, { razorpay_order_id: o.rzp, razorpay_payment_id: pay, razorpay_signature: sig(o.rzp, pay) }, payToken.issue(other.id))).status).toBe(403);
    expect(await state(o.id)).toEqual({ status: "pending_payment", payment_status: "pending" });
  });

  it("a valid signature is not enough: the payment must be captured at Razorpay for this order and amount", async () => {
    const o = await newOrder();
    const pay = `pay_${randomUUID().slice(0, 10)}`;
    const body = { razorpay_order_id: o.rzp, razorpay_payment_id: pay, razorpay_signature: sig(o.rzp, pay) };
    gw.payment = { id: pay, order_id: o.rzp, amount: o.total, currency: "INR", status: "failed" };
    expect((await callVerify(o.id, body)).body.status).toBe("pending_confirmation");
    const pay2 = `pay_${randomUUID().slice(0, 10)}`;
    gw.payment = { id: pay2, order_id: o.rzp, amount: o.total - 50, currency: "INR", status: "captured" };
    expect((await callVerify(o.id, { razorpay_order_id: o.rzp, razorpay_payment_id: pay2, razorpay_signature: sig(o.rzp, pay2) })).body.status).toBe("amount_mismatch");
    expect((await state(o.id)).payment_status).toBe("pending");
    gw.payment = { id: pay, order_id: o.rzp, amount: o.total, currency: "INR", status: "authorized" };
    expect((await callVerify(o.id, body)).body.status).toBe("paid");
    expect(gw.captures).toBe(1);
    expect(await state(o.id)).toEqual({ status: "placed", payment_status: "paid" });
  });
});

describe("payment safety (database)", () => {
  it("a payment id already used for one order never pays another", async () => {
    const a = await newOrder();
    const b = await newOrder();
    const payId = `pay_${randomUUID().slice(0, 10)}`;
    expect((await sendWebhook(captured(a.rzp, a.total, payId))).body.result).toBe("paid");
    expect((await sendWebhook(captured(b.rzp, b.total, payId))).body.result).toBe("payment_reused");
    expect(await state(b.id)).toEqual({ status: "pending_payment", payment_status: "pending" });
  });

  it("a second, different payment for a paid order is flagged for refund", async () => {
    const o = await newOrder();
    expect((await sendWebhook(captured(o.rzp, o.total))).body.result).toBe("paid");
    expect((await sendWebhook(captured(o.rzp, o.total))).body.result).toBe("duplicate_payment");
    const notes = (await getOrderById(o.id))!.events.map((e) => e.note ?? "");
    expect(notes.some((n) => n.includes("refund required"))).toBe(true);
  });

  it("a captured payment with the wrong amount: when the hold expires the order is refund_pending, not failed", async () => {
    const o = await newOrder();
    expect((await sendWebhook(captured(o.rzp, o.total - 100))).body.result).toBe("amount_mismatch");
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [o.id]);
    await query("select release_expired_reservations()");
    expect(await state(o.id)).toEqual({ status: "cancelled", payment_status: "refund_pending" });
  });

  it("an unpaid order with no captured payment still cancels as failed", async () => {
    const o = await newOrder();
    await customerCancel(CUSTOMER, o.id);
    expect(await state(o.id)).toEqual({ status: "cancelled", payment_status: "failed" });
  });
});
