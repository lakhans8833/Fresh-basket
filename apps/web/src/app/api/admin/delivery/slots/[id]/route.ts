import { adminSlotSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminDeleteSlot, adminSaveSlot } from "@/lib/admin/config";

export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  return json(await adminSaveSlot((await params).id, await parseBody(req, adminSlotSchema)));
});
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await adminDeleteSlot((await params).id);
  return json({ ok: true });
});
