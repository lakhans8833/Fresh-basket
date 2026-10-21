import { z } from "zod";
import { badRequest, json, parseBody, rateLimit, route } from "@/lib/http";
import { getSession, requireUser } from "@/lib/auth";
import { reviewEligibility, submitReview } from "@/lib/reviews";

const uuid = z.string().uuid();

/** Can the signed-in customer review this product, and their own review (any status). */
export const GET = route(async (req) => {
  const productId = new URL(req.url).searchParams.get("productId") ?? "";
  if (!uuid.safeParse(productId).success) throw badRequest("Invalid product.");
  const s = await getSession();
  if (!s) return json({ signedIn: false, canReview: false, reason: "Sign in to review products you've received.", mine: null });
  return json({ signedIn: true, ...(await reviewEligibility(s.userId, productId)) });
});

const bodySchema = z.object({
  productId: uuid,
  rating: z.number().int().min(1, "Choose 1 to 5 stars").max(5),
  comment: z.string().trim().max(1000, "Keep it under 1000 characters").nullable().optional(),
});

/** Create/update a review (server checks for a delivered order; it then waits for Admin approval). */
export const POST = route(async (req) => {
  const s = await requireUser();
  await rateLimit(`review:${s.userId}`, 10, 60_000);
  const b = await parseBody(req, bodySchema);
  return json(await submitReview(s.userId, b.productId, b.rating, b.comment ?? null));
});
