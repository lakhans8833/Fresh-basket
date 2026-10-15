import { adminBookingUpdateSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminCreateBookingPaymentLink, adminGetBooking, adminMarkBookingPaid, adminUpdateBookingStatus } from "@/lib/bookings";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireStaff();
  return json({ booking: await adminGetBooking((await params).id) });
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const s = await requireStaff();
  const id = (await params).id;
  const body = await parseBody(req, adminBookingUpdateSchema);
  if ("status" in body) return json({ booking: await adminUpdateBookingStatus(id, body.status, s.userId, body.note) });
  if (body.payment === "mark_paid") return json({ booking: await adminMarkBookingPaid(id, body.reference, s.userId) });
  return json({ booking: await adminCreateBookingPaymentLink(id) });
});
