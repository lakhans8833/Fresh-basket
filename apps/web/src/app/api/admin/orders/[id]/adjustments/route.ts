import { adminAdjustmentSchema } from "@freshbasket/shared";
import { forbidden, json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminAddAdjustment } from "@/lib/admin/adjustments";

/** Record a refund (admin only) or a replacement (staff) for items that arrived missing / damaged / wrong. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const s = await requireStaff();
  const body = await parseBody(req, adminAdjustmentSchema);
  if (body.kind === "refund" && s.profile.role !== "admin") throw forbidden("Only an admin can record a refund.");
  return json({ order: await adminAddAdjustment((await params).id, body, s.userId) }, { status: 201 });
});
