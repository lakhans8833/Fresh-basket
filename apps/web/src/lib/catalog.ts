import "server-only";
import type { Category, ProductDetail, ProductSummary, Variant } from "@freshbasket/shared";
import { query, queryOne } from "./db";

type ProductRow = {
  id: string; slug: string; name: string; category_id: string; category_name: string; category_slug: string;
  description: string | null; highlights: string[]; seasonal: boolean; featured: boolean;
  image_url: string | null; variants: { id: string; label: string; price: number; mrp: number | null; stock: number; active: boolean }[] | null;
};

const PRODUCT_SELECT = `
  select p.id, p.slug, p.name, p.category_id, c.name as category_name, c.slug as category_slug,
         p.description, p.highlights, p.seasonal, p.featured,
         (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
         (select json_agg(json_build_object('id', v.id, 'label', v.label, 'price', v.price, 'mrp', v.mrp, 'stock', v.stock, 'active', v.active) order by v.sort_order, v.price)
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
  };
}

export async function listCategories(): Promise<Category[]> {
  const rows = await query<{ id: string; slug: string; name: string; description: string | null; image_url: string | null; sort_order: number; product_count: string }>(
    `select c.*, (select count(*) from products p where p.category_id = c.id and p.active) as product_count
       from categories c where c.active order by c.sort_order, c.name`,
  );
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, description: r.description, imageUrl: r.image_url, sortOrder: r.sort_order,
    productCount: Number(r.product_count),
  }));
}

export type SortKey = "featured" | "price_asc" | "price_desc" | "name";
export interface ProductFilters {
  q?: string | null;
  category?: string | null; // slug
  seasonal?: boolean;
  featured?: boolean;
  inStockOnly?: boolean;
  sort?: SortKey;
  limit?: number;
}

export async function listProducts(f: ProductFilters = {}): Promise<ProductSummary[]> {
  const where: string[] = ["p.active", "c.active"];
  const params: unknown[] = [];
  if (f.q && f.q.trim()) {
    params.push(`%${f.q.trim().toLowerCase().replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    where.push(`(lower(p.name) like $${params.length} or lower(c.name) like $${params.length})`);
  }
  if (f.category) {
    params.push(f.category);
    where.push(`c.slug = $${params.length}`);
  }
  if (f.seasonal) where.push("p.seasonal");
  if (f.featured) where.push("p.featured");
  const rows = await query<ProductRow>(`${PRODUCT_SELECT} where ${where.join(" and ")} order by p.name`, params);
  let items = rows.map(toSummary).filter((p) => p.variants.length > 0);
  if (f.inStockOnly) items = items.filter((p) => p.inStock);
  const sort = f.sort ?? "featured";
  items.sort((a, b) => {
    if (sort === "price_asc") return a.fromPrice - b.fromPrice;
    if (sort === "price_desc") return b.fromPrice - a.fromPrice;
    if (sort === "name") return a.name.localeCompare(b.name);
    // featured: in-stock first, featured first, then name
    return Number(b.inStock) - Number(a.inStock) || Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name);
  });
  return f.limit ? items.slice(0, f.limit) : items;
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const r = await queryOne<ProductRow>(`${PRODUCT_SELECT} where p.slug = $1 and p.active and c.active`, [slug]);
  if (!r) return null;
  const images = await query<{ id: string; url: string; alt: string | null }>(
    "select id, url, alt from product_images where product_id = $1 order by sort_order",
    [r.id],
  );
  return { ...toSummary(r), description: r.description, highlights: r.highlights ?? [], images, categorySlug: r.category_slug };
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
