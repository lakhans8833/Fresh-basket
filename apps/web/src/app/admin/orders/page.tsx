import type { Metadata } from "next";
import { OrdersList } from "@/components/admin/orders-list";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  return <OrdersList initial={{ status: one(sp.status), q: one(sp.q), date: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : "" }} />;
}
