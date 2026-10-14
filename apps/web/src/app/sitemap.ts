import type { MetadataRoute } from "next";
import { query } from "@/lib/db";
import { storeConfig } from "@/config/store";

export const dynamic = "force-dynamic";

const STATIC: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/shop", priority: 0.9, changeFrequency: "daily" },
  { path: "/categories", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/help", priority: 0.4, changeFrequency: "monthly" },
  { path: "/delivery-policy", priority: 0.4, changeFrequency: "monthly" },
  { path: "/returns", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = storeConfig.siteUrl;
  const out: MetadataRoute.Sitemap = STATIC.map((s) => ({ url: `${base}${s.path}`, changeFrequency: s.changeFrequency, priority: s.priority }));
  try {
    const cats = await query<{ slug: string }>("select slug from categories where active order by sort_order");
    const products = await query<{ slug: string; updated_at: Date; image: string | null }>(
      `select p.slug, p.updated_at, (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image
         from products p join categories c on c.id = p.category_id where p.active and c.active order by p.name`,
    );
    for (const c of cats) out.push({ url: `${base}/category/${c.slug}`, changeFrequency: "daily", priority: 0.8 });
    for (const p of products) {
      out.push({
        url: `${base}/product/${p.slug}`,
        lastModified: p.updated_at,
        changeFrequency: "daily",
        priority: 0.7,
        images: p.image ? [p.image.startsWith("http") ? p.image : `${base}${p.image}`] : undefined,
      });
    }
  } catch (e) {
    console.error("[sitemap] catalogue unavailable", e);
  }
  return out;
}
