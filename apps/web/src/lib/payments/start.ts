import "server-only";
import type { Order, PlaceOrderResponse } from "@freshbasket/shared";
import { randomUUID } from "node:crypto";
import { query, tx } from "../db";
import { env } from "../env";
import { payToken, trackToken } from "../tokens";
import { createRazorpayOrder } from "./razorpay";
import { HttpError } from "../http";

/** Secret tracking page for one order (works without signing in). */
export function trackUrlFor(orderId: string) {
  return `${env.appUrl}/track/${orderId}?k=${trackToken.issue(orderId)}`;
}

export function payUrlFor(orderId: string) {
  return `${env.appUrl}/pay/${orderId}?t=${encodeURIComponent(payToken.issue(orderId))}`;
}

/** Prepare the gateway side of an online payment. Re-uses the gateway order on retries. */
export async function preparePayment(order: Order & { razorpayOrderId?: string | null }): Promise<PlaceOrderResponse["payment"]> {
  if (order.status !== "pending_payment" || order.paymentStatus !== "pending") return undefined;

  if (order.paymentMethod === "mock") {
    if (env.payments.online !== "mock") throw new HttpError(400, "Test payments are disabled.");
    return { provider: "mock", payUrl: payUrlFor(order.id) };
  }

  if (order.paymentMethod === "razorpay") {
    if (env.payments.online !== "razorpay") throw new HttpError(503, "Online payment is not configured.");
    const rzpId = await ensureRazorpayOrder(order.id);
    if (!rzpId) return undefined; // paid or cancelled meanwhile: nothing to pay
    return {
      provider: "razorpay",
      keyId: env.payments.razorpayKeyId!, // publishable key id (not the secret)
      razorpayOrderId: rzpId,
      amount: order.total,
      currency: "INR",
      payUrl: payUrlFor(order.id),
    };
  }
  return undefined;
}

const CLAIM_STALE_SECONDS = 30; // > the 15 s Razorpay timeout
const WAIT_MS = 25_000;

/**
 * The ONE Razorpay order for this order, created at most once, coordinated in the database:
 * - A request CLAIMS preparation with a token on the order row (atomic update, only while the order
 *   awaits payment and has no gateway order). It then calls Razorpay WITHOUT holding a database
 *   connection or lock, and saves the gateway id only if its claim still stands and the order still
 *   awaits payment.
 * - Other requests (double tap, pay page + checkout response, retries, other instances) wait for the
 *   saved id and reuse it. A claim older than 30 s is from a request that died and is taken over.
 * - On a gateway failure or timeout the order is cancelled only if — re-checked under the row lock —
 *   it still awaits payment, has no gateway order, no captured payment, and the claim is still ours.
 * - An order paid or cancelled meanwhile is never handed a payable id ("nothing to pay").
 */
async function ensureRazorpayOrder(orderId: string): Promise<string | null> {
  const token = randomUUID();
  const deadline = Date.now() + WAIT_MS;
  let cur: { status: string; payment_status: string; razorpay_order_id: string | null; total: number; order_number: string } | undefined;
  for (;;) {
    cur = (await query<NonNullable<typeof cur>>(
      "select status, payment_status, razorpay_order_id, total, order_number from orders where id = $1",
      [orderId],
    ))[0];
    if (!cur || cur.status !== "pending_payment" || cur.payment_status !== "pending") return null;
    if (cur.razorpay_order_id) return cur.razorpay_order_id; // reuse
    const claimed = await query<{ id: string }>(
      `update orders set payment_prep_token = $2, payment_prep_at = now()
        where id = $1 and status = 'pending_payment' and payment_status = 'pending' and razorpay_order_id is null
          and (payment_prep_token is null or payment_prep_at < now() - make_interval(secs => $3))
        returning id`,
      [orderId, token, CLAIM_STALE_SECONDS],
    );
    if (claimed[0]) break;
    if (Date.now() > deadline) throw new HttpError(503, "Your payment is still being prepared. Please try again in a moment.");
    await new Promise((r) => setTimeout(r, 250));
  }

  let created: { id: string } | null = null;
  try {
    created = await createRazorpayOrder({ amount: cur.total, receipt: cur.order_number, orderId });
  } catch (e) {
    console.error("[razorpay] create order failed", e);
  }

  if (created) {
    const saved = await query<{ id: string }>(
      `update orders set razorpay_order_id = $2, payment_prep_token = null, payment_prep_at = null
        where id = $1 and payment_prep_token = $3 and razorpay_order_id is null
          and status = 'pending_payment' and payment_status = 'pending'
        returning razorpay_order_id as id`,
      [orderId, created.id, token],
    );
    if (saved[0]) return saved[0].id;
    // Paid/cancelled meanwhile, or (after a very slow call) another request took over: use what's saved.
    const again = (await query<{ id: string | null; status: string; payment_status: string }>(
      "select razorpay_order_id as id, status, payment_status from orders where id = $1",
      [orderId],
    ))[0];
    return again?.status === "pending_payment" && again.payment_status === "pending" ? (again.id ?? null) : null;
  }

  // Failure / timeout: decide under the row lock, in one transaction with the cancellation.
  const outcome = await tx<"cancelled" | "not_ours" | { id: string | null }>(async (c) => {
    const locked = (
      await c.query<{ status: string; payment_status: string; razorpay_order_id: string | null; token: string | null; captured: boolean }>(
        `select o.status, o.payment_status, o.razorpay_order_id, o.payment_prep_token as token,
                exists (select 1 from payments p where p.order_id = o.id and p.status = 'captured') as captured
           from orders o where o.id = $1 for update`,
        [orderId],
      )
    ).rows[0];
    // Paid or cancelled meanwhile (e.g. the webhook arrived): nothing left to prepare, no error.
    if (!locked || locked.status !== "pending_payment" || locked.payment_status !== "pending") return { id: null };
    if (locked.razorpay_order_id) return { id: locked.razorpay_order_id }; // someone else succeeded
    if (locked.token !== token || locked.captured) return "not_ours";
    await c.query("update orders set payment_prep_token = null, payment_prep_at = null where id = $1", [orderId]);
    await c.query("select cancel_order($1, 'system', 'Could not start online payment')", [orderId]);
    return "cancelled";
  });
  if (outcome === "cancelled") {
    // Confirmed cancellation: clients may start a NEW attempt (new idempotency key); the basket is untouched.
    throw new HttpError(502, "We couldn't start the payment, so this order was cancelled. Your basket is unchanged — please try again or choose cash on delivery.", "ORDER_CANCELLED");
  }
  if (outcome === "not_ours") throw new HttpError(502, "We couldn't start the payment just now. Please try again in a moment.");
  return outcome.id;
}
