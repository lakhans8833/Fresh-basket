import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Order } from "@freshbasket/shared";
import { getOrderById } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { trackToken } from "@/lib/tokens";
import { upiPaymentInfo } from "@/lib/payments/upi";
import { OrderDetail } from "@/components/account/order-detail";
import { hasSupportContacts, SupportContacts } from "@/components/info/support-contacts";

export const metadata: Metadata = { title: "Track your order", robots: { index: false, follow: false } };

const TRACK_LINK_DAYS_AFTER_DONE = 30;

function linkExpired(o: Order) {
  if (o.status !== "delivered" && o.status !== "cancelled") return false;
  const last = o.events.at(-1)?.createdAt ?? o.createdAt;
  return Date.now() - Date.parse(last) > TRACK_LINK_DAYS_AFTER_DONE * 86_400_000;
}

const mask = (s: string, keepStart: number, keepEnd: number) =>
  s.length <= keepStart + keepEnd ? s : `${s.slice(0, keepStart)}${"•".repeat(Math.max(3, s.length - keepStart - keepEnd))}${s.slice(s.length - keepEnd)}`;

/**
 * What a tracking link may show: status, items, totals and payment state. The street address and
 * phone are masked, so a forwarded link doesn't expose them.
 */
function forTracking(o: Order): Order {
  const first = o.address.fullName.trim().split(/\s+/)[0] ?? "";
  return {
    ...o,
    address: {
      fullName: first,
      phone: o.address.phone ? mask(o.address.phone, 2, 2) : "",
      line1: "",
      line2: null,
      landmark: null,
      city: o.address.city,
      state: o.address.state,
      pincode: o.address.pincode,
    },
    customerNote: null,
    // Only the cancellation reason is shown; other history notes stay internal.
    events: o.events.map((e) => ({ ...e, note: e.status === "cancelled" ? e.note : null })),
  };
}

/** Secret tracking link (sent on WhatsApp): works without signing in, for this one order only. */
export default async function TrackOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; placed?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !trackToken.verify(id, sp.k)) notFound();
  const [order, settings] = await Promise.all([getOrderById(id), getSettings()]);
  if (!order) notFound();
  // A forwarded link doesn't work forever: 30 days after the order is finished, the link stops working.
  if (linkExpired(order)) notFound();
  const upi = await upiPaymentInfo(order, settings);
  return <OrderDetail order={forTracking(order)} justPlaced={sp.placed === "1"} mode="track" trackKey={sp.k} upi={upi} support={hasSupportContacts(settings) ? <SupportContacts settings={settings} orderNumber={order.orderNumber} title="Help with this order" /> : undefined} />;
}
