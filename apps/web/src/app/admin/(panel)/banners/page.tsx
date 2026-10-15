import type { Metadata } from "next";
import { BannersManager } from "@/components/admin/banners-manager";

export const metadata: Metadata = { title: "Banners" };

export default function AdminBannersPage() {
  return <BannersManager />;
}
