import { adminCouponSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminDeleteCoupon, adminSaveCoupon } from "@/lib/admin/config";

export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  return json(await adminSaveCoupon((await params).id, await parseBody(req, adminCouponSchema)));
});
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await adminDeleteCoupon((await params).id);
  return json({ ok: true });
});
