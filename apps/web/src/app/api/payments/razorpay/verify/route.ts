import { razorpayVerifySchema } from "@freshbasket/shared";
import { badRequest, forbidden, json, notFound, parseBody, route } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getOrderById } from "@/lib/orders";
import { payToken } from "@/lib/tokens";
import { capturePayment, fetchPayment, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { markPaidFromVerifiedPayment } from "@/lib/payments/process";

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

  let payment = await fetchPayment(body.razorpay_payment_id).catch(() => null);
  if (payment?.status === "authorized") payment = await capturePayment(payment.id, order.total).catch(() => payment);
  if (!payment || payment.status !== "captured" || payment.order_id !== body.razorpay_order_id) {
    // Not confirmed yet — the webhook will finalise it. The order page polls for status.
    return json({ status: "pending_confirmation" }, { status: 202 });
  }
  const result = await markPaidFromVerifiedPayment({
    orderId: order.id, provider: "razorpay", providerOrderId: payment.order_id, paymentId: payment.id, amount: payment.amount,
  });
  return json({ status: result });
});
