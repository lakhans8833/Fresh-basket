import { BOOKING_STATUSES } from "@freshbasket/shared";
import { json, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminCountPendingBookings, adminListBookings } from "@/lib/bookings";

export const GET = route(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "";
  const [bookings, pending] = await Promise.all([
    adminListBookings({
      status: (BOOKING_STATUSES as readonly string[]).includes(status) ? status : undefined,
      q: (sp.get("q") ?? "").trim().slice(0, 60) || undefined,
    }),
    adminCountPendingBookings(),
  ]);
  return json({ bookings, pending });
});
