import { adminProductSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { adminListProducts, adminSaveProduct } from "@/lib/admin/catalog";

export const GET = route(async (req) => {
  await requireStaff();
  return json({ products: await adminListProducts(new URL(req.url).searchParams.get("q")) });
});

export const POST = route(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, adminProductSchema);
  return json(await adminSaveProduct(null, body), { status: 201 });
});
