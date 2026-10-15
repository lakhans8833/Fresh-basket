import type { Metadata } from "next";
import { BookingsList } from "@/components/admin/bookings-list";

export const metadata: Metadata = { title: "WhatsApp bookings" };

export default function AdminBookingsPage() {
  return <BookingsList />;
}
