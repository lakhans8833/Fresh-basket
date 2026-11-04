import { json, route } from "@/lib/http";
import { query } from "@/lib/db";
import { CACHE_TAGS, cached } from "@/lib/cache";

/**
 * Active product and category slugs (public anyway: they are in the sitemap). Read by the proxy to give
 * unknown /product/… and /category/… addresses a real 404 (FB-26). Served from the shared catalogue cache,
 * so the database sees at most one query per minute, and none between admin edits.
 */
const slugs = cached("catalog-slugs", [CACHE_TAGS.catalog], 60, async () => {
  const [products, categories] = await Promise.all([
    query<{ slug: string }>("select slug from products where active"),
    query<{ slug: string }>("select slug from categories where active"),
  ]);
  return { products: products.map((r) => r.slug), categories: categories.map((r) => r.slug) };
});

export const GET = route(async () => json(await slugs(), { headers: { "cache-control": "no-store" } }));
