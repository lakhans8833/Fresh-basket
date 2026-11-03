import { adminInventoryPatchSchema } from "@freshbasket/shared";
import { forbidden, json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminInventory, adminPatchInventory } from "@/lib/admin/catalog";

export const GET = route(async () => {
  await requireStaff();
  return json({ rows: await adminInventory() });
});
export const PATCH = route(async (req) => {
  const s = await requireStaff();
  const { updates, products, requestId } = await parseBody(req, adminInventoryPatchSchema);
  // Stock and on/off: staff. Selling prices are catalogue data — admin only, as in the product form.
  if (s.profile.role !== "admin" && updates.some((u) => u.price !== undefined)) throw forbidden("Only an admin can change prices.");
  return json(await adminPatchInventory(updates, products, requestId));
});
