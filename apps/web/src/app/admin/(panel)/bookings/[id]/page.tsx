import type { Metadata } from "next";
import { AdminBookingDetail } from "@/components/admin/booking-detail";

export const metadata: Metadata = { title: "WhatsApp booking" };

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminBookingDetail id={id} />;
}
