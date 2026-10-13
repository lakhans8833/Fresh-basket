import { adminCouponSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListCoupons, adminSaveCoupon } from "@/lib/admin/config";

export const GET = route(async () => {
  await requireAdmin();
  return json({ coupons: await adminListCoupons() });
});
export const POST = route(async (req) => {
  await requireAdmin();
  return json(await adminSaveCoupon(null, await parseBody(req, adminCouponSchema)), { status: 201 });
});
