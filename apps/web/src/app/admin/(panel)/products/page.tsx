import type { Metadata } from "next";
import { ProductsList } from "@/components/admin/products-list";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsPage() {
  return <ProductsList />;
}
