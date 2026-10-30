import { z } from "zod";
import { forbidden, json, notFound, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adjustmentKind, adminCompleteAdjustment } from "@/lib/admin/adjustments";

/** Mark a refund as sent (admin only) or a replacement as delivered (staff). */
export const PATCH = route<{ params: Promise<{ id: string; adjId: string }> }>(async (req, { params }) => {
  const s = await requireStaff();
  const { id, adjId } = await params;
  if (!z.string().uuid().safeParse(adjId).success || !z.string().uuid().safeParse(id).success) throw notFound();
  await parseBody(req, z.object({ status: z.literal("done") }));
  const kind = await adjustmentKind(id, adjId);
  if (!kind) throw notFound();
  if (kind === "refund" && s.profile.role !== "admin") throw forbidden("Only an admin can mark a refund as sent.");
  return json({ order: await adminCompleteAdjustment(id, adjId, s.userId) });
});
