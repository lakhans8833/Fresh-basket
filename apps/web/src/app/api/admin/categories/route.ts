import { adminCategorySchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { adminListCategories, adminSaveCategory } from "@/lib/admin/catalog";

export const GET = route(async () => {
  await requireStaff();
  return json({ categories: await adminListCategories() });
});
export const POST = route(async (req) => {
  await requireAdmin();
  return json(await adminSaveCategory(null, await parseBody(req, adminCategorySchema)), { status: 201 });
});
