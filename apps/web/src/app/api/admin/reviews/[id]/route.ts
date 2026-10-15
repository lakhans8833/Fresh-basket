import { z } from "zod";
import { badRequest, json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminSetReviewStatus } from "@/lib/reviews";

const schema = z.object({ status: z.enum(["pending", "approved", "hidden"]) });

/** Approve or hide a review (approved ones are the only ones customers see). */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  const id = (await params).id;
  if (!z.string().uuid().safeParse(id).success) throw badRequest("Invalid review id.");
  const { status } = await parseBody(req, schema);
  return json(await adminSetReviewStatus(id, status));
});
