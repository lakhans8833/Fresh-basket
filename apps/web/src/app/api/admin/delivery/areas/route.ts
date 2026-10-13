import { adminDeliveryAreaSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListAreas, adminSaveArea } from "@/lib/admin/config";

export const GET = route(async () => {
  await requireAdmin();
  return json({ areas: await adminListAreas() });
});
export const POST = route(async (req) => {
  await requireAdmin();
  return json(await adminSaveArea(null, await parseBody(req, adminDeliveryAreaSchema)), { status: 201 });
});
