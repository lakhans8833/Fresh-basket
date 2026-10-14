import { englishNameFor } from "@freshbasket/shared";
import { json, route } from "@/lib/http";
import { listProducts } from "@/lib/catalog";

/** Type-ahead for the header search: up to 6 products (in-stock first), Hindi names understood. */
export const GET = route(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return json({ products: [], matchedName: null });
  const products = await listProducts({ q, limit: 6 });
  return json(
    { products, matchedName: englishNameFor(q) },
    { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } },
  );
});
