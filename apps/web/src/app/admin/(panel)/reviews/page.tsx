import type { Metadata } from "next";
import { ReviewsManager } from "@/components/admin/reviews-manager";

export const metadata: Metadata = { title: "Reviews" };

export default function AdminReviewsPage() {
  return <ReviewsManager />;
}
