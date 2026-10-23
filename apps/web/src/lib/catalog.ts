import "server-only";
import type { Category, ProductDetail, ProductSummary, Variant } from "@freshbasket/shared";
import { expandSearchTerms } from "@freshbasket/shared";
import { query } from "./db";
import { CACHE_TAGS, cached } from "./cache";
import { defaultVariant } from "@/components/product/default-variant";

/**
 * The price a customer sees first on a product card (the 500 g pack when in stock, else the
 * first in-stock pack). Price filters and price sorting use this — not the smallest pack, which
 * since 100 g packs would put almost everything "Under ₹20".
 */
export const shownPrice = (p: ProductSummary) => defaultVariant(p.variants)?.price ?? p.fromPrice;
const inBucket = (p: ProductSummary, b: { min: number; max: number | null }) => {
  const price = shownPrice(p);
  return price >= b.min && (b.max === null || price <= b.max);
};

type ProductRow = {
  id: string; slug: string; name: string; category_id: string; category_name: string; category_slug: string;
  description: string | null; highlights: string[]; seasonal: boolean; featured: boolean;
  storage_tips?: string | null; shelf_life?: string | null; origin?: string | null; nutrition?: string | null;
  image_url: string | null; variants: { id: string; label: string; price: number; mrp: number | null; stock: number; active: boolean }[] | null;
  stock_grams?: number | null;
};

const PRODUCT_SELECT = `
  select p.id, p.slug, p.name, p.category_id, c.name as category_name, c.slug as category_slug,
         p.description, p.highlights, p.seasonal, p.featured, p.storage_tips, p.shelf_life, p.origin, p.nutrition,
         p.stock_grams::float8 as stock_grams,
         (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
         (select json_agg(json_build_object('id', v.id, 'label', v.label, 'price', v.price, 'mrp', v.mrp, 'stock', v.stock, 'active', v.active, 'note', v.note) order by v.sort_order, v.price)
            from product_variants v where v.product_id = p.id and v.active) as variants
    from products p join categories c on c.id = p.category_id
`;

function toSummary(r: ProductRow): ProductSummary {
  const variants: Variant[] = (r.variants ?? []).map((v) => ({ ...v }));
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    categoryId: r.category_id,
    categoryName: r.category_name,
    imageUrl: r.image_url,
    seasonal: r.seasonal,
    featured: r.featured,
    variants,
    fromPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : 0,
    inStock: variants.some((v) => v.stock > 0),
    stockGrams: r.stock_grams ?? null,
  };
}

/** Active categories with product counts (cached; see lib/cache.ts). */
export const listCategories = cached("categories-v1", [CACHE_TAGS.catalog], 300, async (): Promise<Category[]> => {
  const rows = await query<{ id: string; slug: string; name: string; description: string | null; image_url: string | null; sort_order: number; product_count: string }>(
    `select c.*, (select count(*) from products p where p.category_id = c.id and p.active) as product_count
       from categories c where c.active order by c.sort_order, c.name`,
  );
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, description: r.description, imageUrl: r.image_url, sortOrder: r.sort_order,
    productCount: Number(r.product_count),
  }));
});

export type SortKey = "featured" | "price_asc" | "price_desc" | "name";
export interface ProductFilters {
  q?: string | null;
  category?: string | null; // slug
  seasonal?: boolean;
  featured?: boolean;
  inStockOnly?: boolean;
  sort?: SortKey;
  limit?: number;
  /** Price buckets in rupees, e.g. ["lt20", "20-40", "60+"]; matched against the price of the pack shown on the card (see shownPrice). */
  prices?: string[];
  /** Only these product ids (order of the result still follows `sort`). */
  ids?: string[];
  /** Discount buckets, e.g. ["10+", "25+"]; matched against the product's best % off (in-stock packs). */
  discounts?: string[];
}

/** % off filter like big grocery apps. Uses only the MRP the admin entered — nothing is made up. */
export const DISCOUNT_BUCKETS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: "upto10", label: "Up to 10% off", min: 1, max: 9 },
  { key: "10-25", label: "10% – 24% off", min: 10, max: 24 },
  { key: "25+", label: "25% off or more", min: 25, max: null },
];

/** Biggest whole-number % off among a product's in-stock packs (all packs if none are in stock). */
export function bestPercentOff(variants: { price: number; mrp: number | null; stock: number }[]): number {
  const pool = variants.some((v) => v.stock > 0) ? variants.filter((v) => v.stock > 0) : variants;
  let best = 0;
  for (const v of pool) {
    if (!v.mrp || v.mrp <= v.price) continue;
    best = Math.max(best, Math.floor(((v.mrp - v.price) / v.mrp) * 100));
  }
  return best;
}

export const PRICE_BUCKETS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: "lt20", label: "Under ₹20", min: 0, max: 1999 },
  { key: "20-40", label: "₹20 – ₹40", min: 2000, max: 4000 },
  { key: "40-60", label: "₹40 – ₹60", min: 4001, max: 6000 },
  { key: "60+", label: "₹60 and above", min: 6001, max: null },
];

/**
 * Every product on sale (active product in an active category), cached across requests and dropped
 * whenever stock or the catalogue changes (lib/cache.ts). Filtering happens in memory — the whole
 * shop is a few hundred rows at most, and one cached read is far faster than a query per page.
 */
const activeProductRows = cached("products-v3", [CACHE_TAGS.catalog], 300, () =>
  query<ProductRow>(`${PRODUCT_SELECT} where p.active and c.active order by p.name`),
);

export async function listProducts(f: ProductFilters = {}): Promise<ProductSummary[]> {
  if (f.ids && f.ids.length === 0) return [];
  let rows = await activeProductRows();
  if (f.q && f.q.trim()) {
    // "tamatar" also searches "tomato" (Hindi/Hinglish names, see packages/shared/src/catalog-search.ts)
    const terms = expandSearchTerms(f.q);
    const list = (terms.length ? terms : [f.q.trim()]).map((t) => t.toLowerCase());
    rows = rows.filter((r) => {
      const hay = [r.name.toLowerCase(), r.category_name.toLowerCase(), r.slug.replace(/-/g, " ")];
      return list.some((t) => hay.some((h) => h.includes(t)));
    });
  }
  if (f.category) rows = rows.filter((r) => r.category_slug === f.category);
  if (f.ids) {
    const want = new Set(f.ids);
    rows = rows.filter((r) => want.has(r.id));
  }
  if (f.seasonal) rows = rows.filter((r) => r.seasonal);
  if (f.featured) rows = rows.filter((r) => r.featured);
  let items = rows.map(toSummary).filter((p) => p.variants.length > 0);
  if (f.inStockOnly) items = items.filter((p) => p.inStock);
  const buckets = PRICE_BUCKETS.filter((b) => f.prices?.includes(b.key));
  if (buckets.length) items = items.filter((p) => buckets.some((b) => inBucket(p, b)));
  const off = DISCOUNT_BUCKETS.filter((b) => f.discounts?.includes(b.key));
  if (off.length) {
    items = items.filter((p) => {
      const pct = bestPercentOff(p.variants);
      return off.some((b) => pct >= b.min && (b.max === null || pct <= b.max));
    });
  }
  const sort = f.sort ?? "featured";
  items.sort((a, b) => {
    // Products with every size sold out always go to the end, whatever the sort.
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (sort === "price_asc") return shownPrice(a) - shownPrice(b);
    if (sort === "price_desc") return shownPrice(b) - shownPrice(a);
    if (sort === "name") return a.name.localeCompare(b.name);
    // "Recommended": what can be bought now first, then featured, then products with a photo, then name.
    return Number(b.inStock) - Number(a.inStock) || Number(b.featured) - Number(a.featured)
      || Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) || a.name.localeCompare(b.name);
  });
  return f.limit ? items.slice(0, f.limit) : items;
}

const productImages = cached("product-images-v1", [CACHE_TAGS.catalog], 300, (productId: string) =>
  query<{ id: string; url: string; alt: string | null }>("select id, url, alt from product_images where product_id = $1 order by sort_order", [productId]),
);

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const r = (await activeProductRows()).find((x) => x.slug === slug);
  if (!r) return null;
  // Same rule as the listings: a product whose sizes are all switched off isn't shown.
  if (!toSummary(r).variants.length) return null;
  const images = await productImages(r.id);
  return { ...toSummary(r), description: r.description, highlights: r.highlights ?? [],
    storageTips: r.storage_tips ?? null, shelfLife: r.shelf_life ?? null, origin: r.origin ?? null, nutrition: r.nutrition ?? null, images, categorySlug: r.category_slug };
}

/** Variants for cart display; includes inactive ones so the cart can explain why they're unavailable. */
export async function getVariantsForCart(ids: string[]) {
  if (ids.length === 0) return [];
  return query<{
    variant_id: string; label: string; price: number; stock: number; variant_active: boolean;
    product_id: string; product_slug: string; product_name: string; product_active: boolean; image_url: string | null;
  }>(
    `select v.id as variant_id, v.label, v.price, v.stock, v.active as variant_active,
            p.id as product_id, p.slug as product_slug, p.name as product_name, (p.active and c.active) as product_active,
            (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
       from product_variants v join products p on p.id = v.product_id join categories c on c.id = p.category_id
      where v.id = any($1::uuid[])`,
    [ids],
  );
}

/**
 * Best sellers by units sold in the last 30 days (excluding cancelled orders).
 * Returns an empty list when there isn't enough sales history yet.
 */
/** Ids of products sold most in the last 30 days (≥3 units), or [] when there are fewer than 4. */
export const bestSellerIds = cached("best-sellers-v1", [CACHE_TAGS.catalog], 600, async (limit: number = 8): Promise<string[]> => {
  const rows = await query<{ product_id: string }>(
    `select oi.product_id from order_items oi join orders o on o.id = oi.order_id
      where o.status <> 'cancelled' and o.created_at > now() - interval '30 days' and oi.product_id is not null
      group by oi.product_id having sum(oi.quantity) >= 3 order by sum(oi.quantity) desc limit $1`,
    [limit],
  );
  return rows.length < 4 ? [] : rows.map((r) => r.product_id);
});

export async function listBestSellers(limit = 8): Promise<ProductSummary[]> {
  const ids = await bestSellerIds(limit);
  if (!ids.length) return [];
  const byId = new Map((await listProducts({ ids })).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductSummary => Boolean(p));
}

/** Best saving (whole %, rounded down) across a product's in-stock packs; 0 when none is below MRP. */
export function bestSavingPct(p: ProductSummary): number {
  let best = 0;
  for (const v of p.variants) {
    if (v.stock > 0 && v.mrp && v.mrp > v.price) best = Math.max(best, Math.floor(((v.mrp - v.price) / v.mrp) * 100));
  }
  return best;
}

/** Products with at least one in-stock pack priced below its MRP (set in Admin) — biggest saving first. */
export function dealsFrom(items: ProductSummary[]): ProductSummary[] {
  return items
    .filter((p) => p.inStock)
    .map((p) => ({ p, pct: bestSavingPct(p) }))
    .filter((x) => x.pct >= 1)
    .sort((a, b) => b.pct - a.pct || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p);
}

export async function listDeals(): Promise<ProductSummary[]> {
  return dealsFrom(await listProducts({ inStockOnly: true }));
}

/** Product counts per price bucket (by each product's lowest price), for the home page tiles. */
export function priceBucketsFrom(items: ProductSummary[]): { key: string; label: string; count: number }[] {
  return PRICE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: items.filter((p) => inBucket(p, b)).length,
  }));
}

/**
 * "Buy again": products from the customer's past orders (not cancelled), most recently ordered
 * first, with the pack size they bought last time. Only products still on sale are returned.
 */
export async function listBuyAgain(userId: string, limit = 12): Promise<{ products: ProductSummary[]; lastVariant: Record<string, string> }> {
  const rows = await query<{ product_id: string; variant_id: string | null; created_at: Date }>(
    `select distinct on (oi.product_id) oi.product_id, oi.variant_id, o.created_at
       from order_items oi
       join orders o on o.id = oi.order_id
      where o.user_id = $1 and o.status <> 'cancelled' and oi.product_id is not null
      order by oi.product_id, o.created_at desc`,
    [userId],
  );
  if (!rows.length) return { products: [], lastVariant: {} };
  const recency = new Map(rows.map((r) => [r.product_id, new Date(r.created_at).getTime()]));
  const products = (await listProducts({ ids: rows.map((r) => r.product_id) }))
    .sort((a, b) => (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0))
    .slice(0, limit);
  const lastVariant: Record<string, string> = {};
  for (const r of rows) if (r.variant_id) lastVariant[r.product_id] = r.variant_id;
  return { products, lastVariant };
}
