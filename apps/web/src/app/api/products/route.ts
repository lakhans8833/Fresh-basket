import { json, route } from "@/lib/http";
import { listProducts, type SortKey } from "@/lib/catalog";

const SORTS: SortKey[] = ["featured", "price_asc", "price_desc", "name"];

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const sort = sp.get("sort") as SortKey | null;
  // ?ids=a,b,c — only these products (saved items). Invalid ids are ignored.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = sp.has("ids") ? (sp.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 200) : undefined;
  const products = await listProducts({
    q: sp.get("q")?.slice(0, 60),
    category: sp.get("category"),
    seasonal: sp.get("seasonal") === "1",
    featured: sp.get("featured") === "1",
    inStockOnly: sp.get("inStock") === "1",
    sort: sort && SORTS.includes(sort) ? sort : "featured",
    ids,
    limit: Math.min(Number(sp.get("limit") ?? 100) || 100, 200),
  });
  return json({ products });
});
