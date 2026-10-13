import type { Metadata } from "next";
import { DeliveryManager } from "@/components/admin/delivery-manager";

export const metadata: Metadata = { title: "Delivery" };

export default function AdminDeliveryPage() {
  return <DeliveryManager />;
}
