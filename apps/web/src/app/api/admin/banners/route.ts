import { adminBannerSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListBanners, adminSaveBanner } from "@/lib/banners";

export const GET = route(async () => {
  await requireAdmin();
  return json({ banners: await adminListBanners() });
});
export const POST = route(async (req) => {
  await requireAdmin();
  return json(await adminSaveBanner(null, await parseBody(req, adminBannerSchema)), { status: 201 });
});
