import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMyOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { upiPaymentInfo } from "@/lib/payments/upi";
import { OrderDetail } from "@/components/account/order-detail";
import { hasSupportContacts, SupportContacts } from "@/components/info/support-contacts";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getMyOrder(session.userId, id);
  if (!order) notFound();
  const settings = await getSettings();
  const upi = await upiPaymentInfo(order, settings);
  return (
    <OrderDetail
      order={order} justPlaced={(await searchParams).placed === "1"} upi={upi}
      support={hasSupportContacts(settings) ? <SupportContacts settings={settings} orderNumber={order.orderNumber} title="Help with this order" /> : undefined}
    />
  );
}
