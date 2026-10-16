import "server-only";
import type { Order, PlaceOrderResponse } from "@freshbasket/shared";
import { tx } from "../db";
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

type PrepOutcome = { id: string | null } | { failed: true; cancelled: boolean };

/**
 * The ONE Razorpay order for this order, created at most once (database-coordinated):
 * - A Postgres advisory lock per order (transaction-scoped, so it is released if the request or
 *   instance dies — no stale claims) serialises preparation across all server instances. Parallel
 *   requests (double tap, pay page + checkout response, retries) wait, then reuse the saved id.
 * - The order row is re-read under the lock before anything is created or cancelled, and is NOT held
 *   locked during the gateway call, so webhooks, expiry and cancellations aren't blocked.
 * - The gateway id is saved only while the order still awaits payment; an order cancelled or paid
 *   meanwhile is never handed a payable id.
 * - On a gateway failure or timeout the order is cancelled only if — re-checked under the row lock —
 *   it still awaits payment, has no gateway order and no captured payment.
 */
async function ensureRazorpayOrder(orderId: string): Promise<string | null> {
  const outcome = await tx<PrepOutcome>(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('payment_prep:' || $1::text))", [orderId]);
    const cur = (
      await c.query<{ status: string; payment_status: string; razorpay_order_id: string | null; total: number; order_number: string }>(
        "select status, payment_status, razorpay_order_id, total, order_number from orders where id = $1",
        [orderId],
      )
    ).rows[0];
    if (!cur || cur.status !== "pending_payment" || cur.payment_status !== "pending") return { id: null };
    if (cur.razorpay_order_id) return { id: cur.razorpay_order_id }; // reuse

    let created: { id: string } | null = null;
    try {
      created = await createRazorpayOrder({ amount: cur.total, receipt: cur.order_number, orderId });
    } catch (e) {
      console.error("[razorpay] create order failed", e);
    }

    if (created) {
      const saved = await c.query<{ id: string }>(
        `update orders set razorpay_order_id = $2
          where id = $1 and razorpay_order_id is null and status = 'pending_payment' and payment_status = 'pending'
          returning razorpay_order_id as id`,
        [orderId, created.id],
      );
      if (saved.rows[0]) return { id: saved.rows[0].id };
      // Cancelled or paid while Razorpay answered: hand out nothing payable.
      const again = (await c.query<{ id: string | null; status: string }>("select razorpay_order_id as id, status from orders where id = $1", [orderId])).rows[0];
      return { id: again?.status === "pending_payment" ? (again.id ?? null) : null };
    }

    const locked = (
      await c.query<{ status: string; payment_status: string; razorpay_order_id: string | null; captured: boolean }>(
        `select o.status, o.payment_status, o.razorpay_order_id,
                exists (select 1 from payments p where p.order_id = o.id and p.status = 'captured') as captured
           from orders o where o.id = $1 for update`,
        [orderId],
      )
    ).rows[0];
    // Paid or cancelled meanwhile (e.g. the webhook arrived): nothing left to prepare, no error.
    if (!locked || locked.status !== "pending_payment" || locked.payment_status !== "pending") return { id: null };
    const safeToCancel = !locked.razorpay_order_id && !locked.captured;
    if (safeToCancel) await c.query("select cancel_order($1, 'system', 'Could not start online payment')", [orderId]);
    return { failed: true, cancelled: safeToCancel };
  });

  if ("failed" in outcome) {
    if (outcome.cancelled) {
      // Confirmed cancellation: clients may start a NEW attempt (new idempotency key); the basket is untouched.
      throw new HttpError(502, "We couldn't start the payment, so this order was cancelled. Your basket is unchanged — please try again or choose cash on delivery.", "ORDER_CANCELLED");
    }
    throw new HttpError(502, "We couldn't start the payment just now. Please try again in a moment.");
  }
  return outcome.id;
}
