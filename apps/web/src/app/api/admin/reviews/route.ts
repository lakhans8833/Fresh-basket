import { json, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListReviews } from "@/lib/reviews";

export const GET = route(async (req) => {
  await requireAdmin();
  return json({ reviews: await adminListReviews(new URL(req.url).searchParams.get("status")) });
});
