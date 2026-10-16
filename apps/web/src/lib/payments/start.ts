import "server-only";
import type { Order, PlaceOrderResponse } from "@freshbasket/shared";
import { tx } from "../db";
import { env } from "../env";
import { payToken } from "../tokens";
import { createRazorpayOrder } from "./razorpay";
import { HttpError } from "../http";

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
    const rzpId = await ensureRazorpayOrder(order);
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
 * The ONE Razorpay order for this order, created at most once.
 * - Serialised per order across server instances with a Postgres advisory lock (held in its own
 *   transaction for the duration of the gateway call), so parallel requests (double tap, pay page +
 *   checkout response, retries) wait for the first one and then reuse the gateway order it saved.
 * - The order row itself is NOT locked while Razorpay is called, so webhooks and cancellations aren't
 *   blocked; every decision re-reads the row.
 * - On a gateway failure or timeout the order is cancelled only if it still has no gateway order and no
 *   confirmed payment (and is still awaiting payment) — checked under the row lock.
 * - The gateway id is saved only while the order still awaits payment; a concurrently cancelled order
 *   is never handed a payable id.
 */
async function ensureRazorpayOrder(order: Order & { razorpayOrderId?: string | null }): Promise<string | null> {
  const outcome = await tx<PrepOutcome>(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('payment_prep:' || $1::text))", [order.id]);
    const cur = (
      await c.query<{ status: string; payment_status: string; razorpay_order_id: string | null; total: number; order_number: string }>(
        "select status, payment_status, razorpay_order_id, total, order_number from orders where id = $1",
        [order.id],
      )
    ).rows[0];
    if (!cur || cur.status !== "pending_payment" || cur.payment_status !== "pending") return { id: null };
    if (cur.razorpay_order_id) return { id: cur.razorpay_order_id }; // reuse

    let created: { id: string } | null = null;
    try {
      created = await createRazorpayOrder({ amount: cur.total, receipt: cur.order_number, orderId: order.id });
    } catch (e) {
      console.error("[razorpay] create order failed", e);
    }

    if (created) {
      const saved = await c.query<{ id: string }>(
        `update orders set razorpay_order_id = $2
          where id = $1 and razorpay_order_id is null and status = 'pending_payment' and payment_status = 'pending'
          returning razorpay_order_id as id`,
        [order.id, created.id],
      );
      if (saved.rows[0]) return { id: saved.rows[0].id };
      // Cancelled or paid while Razorpay answered: hand out nothing payable.
      const again = (await c.query<{ id: string | null; status: string }>("select razorpay_order_id as id, status from orders where id = $1", [order.id])).rows[0];
      return { id: again?.status === "pending_payment" ? (again.id ?? null) : null };
    }

    // Failure / timeout: cancel only an order that still waits for payment with no gateway order and no
    // captured payment. Locking the row here makes the check and the cancellation one atomic step.
    const locked = (
      await c.query<{ status: string; payment_status: string; razorpay_order_id: string | null; captured: boolean }>(
        `select o.status, o.payment_status, o.razorpay_order_id,
                exists (select 1 from payments p where p.order_id = o.id and p.status = 'captured') as captured
           from orders o where o.id = $1 for update`,
        [order.id],
      )
    ).rows[0];
    // Paid or cancelled meanwhile (e.g. the webhook arrived): nothing left to prepare, no error.
    if (!locked || locked.status !== "pending_payment" || locked.payment_status !== "pending") return { id: null };
    const safeToCancel =
      locked && locked.status === "pending_payment" && locked.payment_status === "pending" && !locked.razorpay_order_id && !locked.captured;
    if (safeToCancel) await c.query("select cancel_order($1, 'system', 'Could not start online payment')", [order.id]);
    return { failed: true, cancelled: Boolean(safeToCancel) };
  });

  if ("failed" in outcome) {
    throw new HttpError(
      502,
      outcome.cancelled
        ? "We couldn't start the payment. Your basket is unchanged — please try again or choose cash on delivery."
        : "We couldn't start the payment just now. Please try again in a moment.",
    );
  }
  return outcome.id;
}
