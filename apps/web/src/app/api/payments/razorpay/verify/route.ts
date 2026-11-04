import { razorpayVerifySchema } from "@freshbasket/shared";
import { badRequest, forbidden, json, notFound, parseBody, route } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getOrderById } from "@/lib/orders";
import { payToken } from "@/lib/tokens";
import { capturePayment, fetchPayment, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { afterPaymentApplied, applyVerifiedPayment, markPaidFromVerifiedPayment } from "@/lib/payments/process";
import { tx } from "@/lib/db";

/**
 * Called by the checkout page after Razorpay's handler fires. The client callback alone
 * is never trusted: we verify the signature AND fetch the payment from Razorpay to
 * confirm it is captured for the right order and amount. The webhook is the backstop.
 */
export const POST = route(async (req) => {
  if (env.payments.online !== "razorpay") throw badRequest("Razorpay is not configured.");
  const body = await parseBody(req, razorpayVerifySchema);
  const order = await getOrderById(body.orderId);
  if (!order) throw notFound("Order not found.");

  const session = await getSession();
  const token = new URL(req.url).searchParams.get("t");
  if (session?.userId !== order.userId && !payToken.verify(order.id, token)) throw forbidden();

  if (order.razorpayOrderId !== body.razorpay_order_id) throw badRequest("Payment does not belong to this order.");
  if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    throw badRequest("Payment signature is invalid.");
  }

  const payment = await fetchPayment(body.razorpay_payment_id).catch(() => null);
  const belongs = (p: { status?: string; order_id?: string } | null) => p?.status === "captured" && p.order_id === body.razorpay_order_id;

  if (payment?.status === "authorized") {
    // FB-34: hold the order row from the "can it still use this payment?" check through capture AND marking it
    // paid, so a customer/store cancel can't slip in between and leave captured money on a cancelled order.
    // A cancel that arrives meanwhile waits (a few seconds at most; capture times out at 15 s) and then sees a
    // paid order. Usable = waiting for payment, or released because the payment window ran out (a late payment
    // revives it). For an order cancelled on purpose the authorisation is NOT captured: Razorpay voids it.
    const out = await tx(async (c) => {
      const { rows } = await c.query<{ status: string; expired: boolean }>(
        "select status, coalesce(cancelled_reason = 'Payment was not completed in time', false) as expired from orders where id = $1 for update",
        [order.id],
      );
      const o = rows[0]!;
      if (!(o.status === "pending_payment" || (o.status === "cancelled" && o.expired))) {
        return { status: o.status === "cancelled" ? "order_cancelled" : "already_paid" } as const;
      }
      const cap = await capturePayment(payment.id, order.total).catch(() => null);
      // Not confirmed yet — the webhook will finalise it. The order page polls for status.
      if (!belongs(cap)) return { status: "pending_confirmation" } as const;
      return { status: await applyVerifiedPayment(c, { orderId: order.id, provider: "razorpay", providerOrderId: cap!.order_id, paymentId: cap!.id, amount: cap!.amount }), applied: true } as const;
    });
    if ("applied" in out) afterPaymentApplied(order.id, out.status);
    return json({ status: out.status }, out.status === "pending_confirmation" ? { status: 202 } : undefined);
  }

  if (!payment || !belongs(payment)) {
    // Not confirmed yet — the webhook will finalise it. The order page polls for status.
    return json({ status: "pending_confirmation" }, { status: 202 });
  }
  const result = await markPaidFromVerifiedPayment({
    orderId: order.id, provider: "razorpay", providerOrderId: payment.order_id, paymentId: payment.id, amount: payment.amount,
  });
  return json({ status: result });
});
