import "server-only";
import type { Order, PlaceOrderResponse } from "@freshbasket/shared";
import { query } from "../db";
import { env } from "../env";
import { payToken } from "../tokens";
import { cancelOrder } from "../orders";
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
    let rzpId = order.razorpayOrderId ?? null;
    if (!rzpId) {
      try {
        const r = await createRazorpayOrder({ amount: order.total, receipt: order.orderNumber, orderId: order.id });
        const saved = await query<{ id: string }>(
          "update orders set razorpay_order_id = $2 where id = $1 and razorpay_order_id is null returning razorpay_order_id as id",
          [order.id, r.id],
        );
        // Two requests raced (retry / pay page): always hand out the ONE gateway order we saved, so the
        // customer can't pay against an order id we don't know about.
        rzpId = saved[0]?.id ?? (await query<{ id: string | null }>("select razorpay_order_id as id from orders where id = $1", [order.id]))[0]?.id ?? r.id;
      } catch (e) {
        console.error("[razorpay] create order failed", e);
        await cancelOrder(order.id, "system", "Could not start online payment");
        throw new HttpError(502, "We couldn't start the payment. Your basket is unchanged — please try again or choose cash on delivery.");
      }
    }
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
