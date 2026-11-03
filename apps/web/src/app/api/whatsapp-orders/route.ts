import { buildWhatsAppOrderUrl, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, UNAVAILABLE_ITEM_LABEL, whatsappOrderSchema } from "@freshbasket/shared";
import { clientIp, HttpError, json, parseBody, rateLimit, rateLimitCount, route } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { placeWhatsAppOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber } from "@/config/store";
import { ensurePaymentLink } from "@/lib/payments/links";
import { trackUrlFor } from "@/lib/payments/start";
import { trackToken } from "@/lib/tokens";
import { upiPaymentInfo } from "@/lib/payments/upi";


/** New guest WhatsApp orders allowed per network per day. */
const GUEST_WA_ORDERS_PER_DAY = 20;
/**
 * "Order on WhatsApp". The order is created here first — totals and delivery charge computed on the
 * server, stock reserved, idempotent (same key or identical resubmit → same order) — and only then
 * is the WhatsApp message built (by the server, from the saved order) for the customer to send.
 * Payment: cash on delivery, UPI (verified by staff) or a Razorpay Payment Link for the exact total.
 */
export const POST = route(async (req) => {
  await rateLimit(`wa-order:${clientIp(req)}`, 8, 10 * 60_000);
  const input = await parseBody(req, whatsappOrderSchema);
  await rateLimit(`wa-order-phone:${input.customer.phone}`, 6, 10 * 60_000);
  const settings = await getSettings();
  const number = resolveWhatsAppNumber(settings.whatsapp);
  if (!number) throw new HttpError(503, "WhatsApp ordering isn't set up yet. Please use the website checkout.");

  const session = await getSession().catch(() => null);
  // Guests aren't verified: a daily cap per network stops one person filling the shop's stock with
  // fake WhatsApp orders (each one holds stock until staff confirm or it expires). Only NEW orders count
  // (a retry of an order already placed gets that order back), and the cap allows for many customers
  // sharing one mobile-carrier address.
  const dayKey = `wa-order-day:${clientIp(req)}`;
  if (
    !session &&
    (await rateLimitCount(dayKey)) >= GUEST_WA_ORDERS_PER_DAY &&
    // A retry of an order already placed still gets that order back.
    !(await queryOne("select 1 from orders where user_id is null and address->>'phone' = $1 and idempotency_key = $2", [input.customer.phone, input.idempotencyKey]))
  ) {
    throw new HttpError(429, "Too many WhatsApp orders from this network today. Please sign in to order, or call the store.", "RATE_LIMITED");
  }
  const { order, created } = await placeWhatsAppOrder(session?.userId ?? null, input);
  if (!session && created) await rateLimit(dayKey, Number.MAX_SAFE_INTEGER, 24 * 60 * 60_000);
  // (A retry matching an order cancelled meanwhile gets ORDER_CANCELLED from placeWhatsAppOrder.)
  const payLink = await ensurePaymentLink(order);
  const trackUrl = trackUrlFor(order.id);

  const whatsappUrl = buildWhatsAppOrderUrl(number, {
    storeName: settings.storeName,
    reference: order.orderNumber,
    customer: input.customer,
    lines: order.items.map((i) => ({ name: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    subtotal: order.subtotal,
    discount: order.discount,
    couponCode: order.couponCode,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod: PAYMENT_METHOD_LABEL[order.paymentMethod],
    paymentStatus: PAYMENT_STATUS_LABEL[order.paymentStatus],
    payLink,
    trackUrl,
    ifUnavailable: order.unavailableItems ? UNAVAILABLE_ITEM_LABEL[order.unavailableItems].title : null,
    delivery: input.slotId ? `${new Date(`${order.deliveryDate}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · ${order.slotLabel}` : null,
  });

  return json(
    {
      order: {
        id: order.id, orderNumber: order.orderNumber, status: order.status, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
        subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, total: order.total, upiReference: order.upiReference,
        reservationExpiresAt: order.reservationExpiresAt,
      },
      trackKey: trackToken.issue(order.id),
      trackUrl,
      whatsappUrl,
      payLink,
      upi: await upiPaymentInfo(order, settings),
      created,
    },
    { status: created ? 201 : 200 },
  );
});
