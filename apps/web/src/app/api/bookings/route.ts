import { createBookingSchema } from "@freshbasket/shared";
import { clientIp, json, parseBody, rateLimit, route } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { createBooking } from "@/lib/bookings";

/**
 * Saves a WhatsApp booking (server-side prices and booking number) and returns the wa.me link with the
 * pre-filled message. No account needed. The booking starts as "Pending Confirmation".
 */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  rateLimit(`booking:${ip}`, 8, 10 * 60_000);
  const input = await parseBody(req, createBookingSchema);
  rateLimit(`booking-phone:${input.customer.phone}`, 5, 10 * 60_000);
  const session = await getSession().catch(() => null);
  const r = await createBooking(input, { userId: session?.userId ?? null });
  return json(
    {
      booking: {
        id: r.booking.id, bookingNumber: r.booking.bookingNumber, status: r.booking.status, statusLabel: r.booking.statusLabel,
        paymentMethod: r.booking.paymentMethod, paymentStatus: r.booking.paymentStatus, deliveryDate: r.booking.deliveryDate,
        slotLabel: r.booking.slotLabel, subtotal: r.booking.subtotal, deliveryFee: r.booking.deliveryFee, total: r.booking.total,
        paymentLinkUrl: r.booking.paymentLinkUrl,
        items: r.booking.items.map((i) => ({ productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, lineTotal: i.lineTotal })),
      },
      created: r.created,
      whatsappUrl: r.whatsappUrl,
      upiLink: r.upiLink,
    },
    { status: r.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
});
