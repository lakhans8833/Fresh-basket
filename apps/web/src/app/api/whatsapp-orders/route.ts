import { buildWhatsAppOrderUrl, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, whatsappOrderSchema } from "@freshbasket/shared";
import { clientIp, HttpError, json, parseBody, rateLimit, route } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { placeWhatsAppOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber } from "@/config/store";
import { ensurePaymentLink } from "@/lib/payments/links";
import { trackUrlFor } from "@/lib/payments/start";
import { trackToken } from "@/lib/tokens";
import { upiPaymentInfo } from "@/lib/payments/upi";

/**
 * "Order on WhatsApp". The order is created here first — totals and delivery charge computed on the
 * server, stock reserved, idempotent (same key or identical resubmit → same order) — and only then
 * is the WhatsApp message built (by the server, from the saved order) for the customer to send.
 * Payment: cash on delivery, UPI (verified by staff) or a Razorpay Payment Link for the exact total.
 */
export const POST = route(async (req) => {
  rateLimit(`wa-order:${clientIp(req)}`, 8, 10 * 60_000);
  const input = await parseBody(req, whatsappOrderSchema);
  rateLimit(`wa-order-phone:${input.customer.phone}`, 6, 10 * 60_000);
  const settings = await getSettings();
  const number = resolveWhatsAppNumber(settings.whatsapp);
  if (!number) throw new HttpError(503, "WhatsApp ordering isn't set up yet. Please use the website checkout.");

  const session = await getSession().catch(() => null);
  const { order, created } = await placeWhatsAppOrder(session?.userId ?? null, input);
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
