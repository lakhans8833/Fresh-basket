import { adminDeliveryAreaSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminDeleteArea, adminSaveArea } from "@/lib/admin/config";

export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  return json(await adminSaveArea((await params).id, await parseBody(req, adminDeliveryAreaSchema)));
});
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await adminDeleteArea((await params).id);
  return json({ ok: true });
});
