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

  // Only one request creates the link: claim it with a placeholder id (a retry or double tap waits for
  // the first one instead of creating a second link or cancelling the order). A claim older than
  // a minute is from a request that died and can be taken over.
  const claim = `creating:${Date.now()}`;
  const claimed = await queryOne<{ id: string }>(
    `update orders set razorpay_payment_link_id = $2
      where id = $1 and razorpay_payment_link_url is null
        and (razorpay_payment_link_id is null
             or (razorpay_payment_link_id like 'creating:%'
                 and substr(razorpay_payment_link_id, 10)::bigint < (extract(epoch from now()) * 1000)::bigint - 60000))
      returning id`,
    [order.id, claim],
  );
  if (!claimed) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const s2 = await queryOne<{ url: string | null; status: string }>("select razorpay_payment_link_url as url, status from orders where id = $1", [order.id]);
      if (s2?.url) return s2.url;
      if (s2?.status !== "pending_payment") break;
    }
    throw new HttpError(503, "Your payment link is still being created. Please try again in a moment.");
  }

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
      "update orders set razorpay_payment_link_id = $2, razorpay_payment_link_url = $3 where id = $1 and razorpay_payment_link_id = $4",
      [order.id, link.id, link.short_url, claim],
    );
  } catch (e) {
    console.error("[razorpay] payment link failed", e);
    await query("update orders set razorpay_payment_link_id = null where id = $1 and razorpay_payment_link_id = $2", [order.id, claim]);
    await cancelOrder(order.id, "system", "Could not create the payment link");
    throw new HttpError(502, "We couldn't create the payment link. Your order was cancelled — please try again or choose another payment method.");
  }
  return (await queryOne<{ url: string | null }>("select razorpay_payment_link_url as url from orders where id = $1", [order.id]))?.url ?? null;
}
