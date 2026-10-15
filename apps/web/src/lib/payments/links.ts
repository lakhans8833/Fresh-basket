import "server-only";
import type { Order } from "@freshbasket/shared";
import { query, queryOne } from "../db";
import { env } from "../env";
import { HttpError } from "../http";
import { cancelOrder } from "../orders";
import { createPaymentLink } from "./razorpay";
import { trackUrlFor } from "./start";

/**
 * Creates (once) the Razorpay Payment Link for an order paid by link, for exactly the order total
 * stored in the database. Returns the link URL, or null when not applicable.
 * The order is marked paid only by the verified `payment_link.paid` webhook — never by the link itself.
 */
export async function ensurePaymentLink(order: Order): Promise<string | null> {
  if (order.paymentMethod !== "razorpay_link" || order.status !== "pending_payment" || order.paymentStatus !== "pending") return null;
  const stored = await queryOne<{ url: string | null; expires: Date | null }>(
    "select razorpay_payment_link_url as url, reservation_expires_at as expires from orders where id = $1",
    [order.id],
  );
  if (stored?.url) return stored.url;
  if (env.payments.online !== "razorpay") throw new HttpError(503, "Online payment links aren't configured.");

  // The link expires with the stock hold (Razorpay needs at least 15 minutes from now).
  const expireBy = Math.max(
    Math.floor((stored?.expires?.getTime() ?? Date.now() + 24 * 3600_000) / 1000),
    Math.floor(Date.now() / 1000) + 20 * 60,
  );
  try {
    const link = await createPaymentLink({
      amount: order.total,
      orderNumber: order.orderNumber,
      orderId: order.id,
      description: `Order ${order.orderNumber}`,
      customer: { name: order.address.fullName, contact: `+91${order.address.phone}` },
      callbackUrl: trackUrlFor(order.id),
      expireBy,
    });
    if (link.amount !== order.total) throw new Error(`Payment link amount ${link.amount} != order total ${order.total}`);
    await query(
      "update orders set razorpay_payment_link_id = $2, razorpay_payment_link_url = $3 where id = $1 and razorpay_payment_link_id is null",
      [order.id, link.id, link.short_url],
    );
  } catch (e) {
    console.error("[razorpay] payment link failed", e);
    // A parallel request may have created it (Razorpay rejects a duplicate reference_id).
    const again = await queryOne<{ url: string | null }>("select razorpay_payment_link_url as url from orders where id = $1", [order.id]);
    if (again?.url) return again.url;
    await cancelOrder(order.id, "system", "Could not create the payment link");
    throw new HttpError(502, "We couldn't create the payment link. Your order was cancelled — please try again or choose another payment method.");
  }
  return (await queryOne<{ url: string | null }>("select razorpay_payment_link_url as url from orders where id = $1", [order.id]))?.url ?? null;
}
