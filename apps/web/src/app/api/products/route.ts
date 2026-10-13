import { json, route } from "@/lib/http";
import { listProducts, type SortKey } from "@/lib/catalog";

const SORTS: SortKey[] = ["featured", "price_asc", "price_desc", "name"];

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const sort = sp.get("sort") as SortKey | null;
  const products = await listProducts({
    q: sp.get("q")?.slice(0, 60),
    category: sp.get("category"),
    seasonal: sp.get("seasonal") === "1",
    featured: sp.get("featured") === "1",
    inStockOnly: sp.get("inStock") === "1",
    sort: sort && SORTS.includes(sort) ? sort : "featured",
    limit: Math.min(Number(sp.get("limit") ?? 100) || 100, 200),
  });
  return json({ products });
});
