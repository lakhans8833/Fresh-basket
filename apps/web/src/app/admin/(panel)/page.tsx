import type { Metadata } from "next";
import { Dashboard, type Stats } from "@/components/admin/dashboard";
import { requireStaff } from "@/lib/auth";
import { adminStats } from "@/lib/admin/orders";

export const metadata: Metadata = { title: "Dashboard" };

/** Dashboard data is read on the server in the same request, so the page opens with numbers (no skeleton). */
export default async function AdminHome() {
  const initial = await requireStaff()
    .then(() => adminStats())
    .then((s) => JSON.parse(JSON.stringify(s)) as Stats)
    .catch(() => null); // signed out / no access: the layout handles it; DB error: the client retries
  return <Dashboard initial={initial} />;
}
