import { adminProductSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { adminDeleteProduct, adminGetProduct, adminSaveProduct } from "@/lib/admin/catalog";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireStaff();
  return json({ product: await adminGetProduct((await params).id) });
});
export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  const body = await parseBody(req, adminProductSchema);
  return json(await adminSaveProduct((await params).id, body));
});
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  return json(await adminDeleteProduct((await params).id));
});
