import { json, notFound, route } from "@/lib/http";
import { getProduct } from "@/lib/catalog";

export const GET = route<{ params: Promise<{ slug: string }> }>(async (_req, { params }) => {
  const product = await getProduct((await params).slug);
  if (!product) throw notFound("Product not found.");
  return json({ product });
});
