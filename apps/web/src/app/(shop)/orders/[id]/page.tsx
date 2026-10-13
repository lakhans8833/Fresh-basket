import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMyOrder } from "@/lib/orders";
import { OrderDetail } from "@/components/account/order-detail";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getMyOrder(session.userId, id);
  if (!order) notFound();
  return <OrderDetail order={order} justPlaced={(await searchParams).placed === "1"} />;
}
