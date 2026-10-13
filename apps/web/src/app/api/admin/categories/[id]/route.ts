import { adminCategorySchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminDeleteCategory, adminSaveCategory } from "@/lib/admin/catalog";

export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  return json(await adminSaveCategory((await params).id, await parseBody(req, adminCategorySchema)));
});
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await adminDeleteCategory((await params).id);
  return json({ ok: true });
});
