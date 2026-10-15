import { adminInventoryPatchSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminInventory, adminPatchInventory } from "@/lib/admin/catalog";

export const GET = route(async () => {
  await requireStaff();
  return json({ rows: await adminInventory() });
});
export const PATCH = route(async (req) => {
  await requireStaff();
  const { updates, products } = await parseBody(req, adminInventoryPatchSchema);
  return json(await adminPatchInventory(updates, products));
});
