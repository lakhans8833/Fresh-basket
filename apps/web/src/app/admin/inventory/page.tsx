import type { Metadata } from "next";
import { InventoryTable } from "@/components/admin/inventory-table";

export const metadata: Metadata = { title: "Inventory" };

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  return <InventoryTable initialQ={one(sp.q)} initialFilter={one(sp.filter)} />;
}
