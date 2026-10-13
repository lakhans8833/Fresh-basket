import { adminSlotSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListSlots, adminSaveSlot } from "@/lib/admin/config";

export const GET = route(async () => {
  await requireAdmin();
  return json({ slots: await adminListSlots() });
});
export const POST = route(async (req) => {
  await requireAdmin();
  return json(await adminSaveSlot(null, await parseBody(req, adminSlotSchema)), { status: 201 });
});
