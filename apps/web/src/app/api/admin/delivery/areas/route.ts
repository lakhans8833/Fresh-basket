import { adminDeliveryAreaSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListAreas, adminSaveArea } from "@/lib/admin/config";
import { getDefaultMinOrder, serviceAreaMismatches } from "@/lib/delivery";
import { storeConfig } from "@/config/store";

export const GET = route(async () => {
  await requireAdmin();
  const [areas, storeMinOrder] = await Promise.all([adminListAreas(), getDefaultMinOrder()]);
  return json({
    areas,
    storeMinOrder,
    serviceArea: { name: storeConfig.serviceArea, state: storeConfig.defaultState },
    mismatches: serviceAreaMismatches(areas as Parameters<typeof serviceAreaMismatches>[0]),
  });
});
export const POST = route(async (req) => {
  await requireAdmin();
  return json(await adminSaveArea(null, await parseBody(req, adminDeliveryAreaSchema)), { status: 201 });
});
