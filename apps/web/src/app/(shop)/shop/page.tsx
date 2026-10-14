import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { listCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { ShopView, parseShopFilters } from "@/components/product/shop-view";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : null;
  return {
    title: q ? `Search: ${q}` : "Shop fresh vegetables online",
    description: `Buy fresh vegetables online — leafy greens, daily vegetables and seasonal picks with home delivery in ${storeConfig.serviceArea}.`,
    alternates: { canonical: "/shop" },
    robots: q ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Old-style /shop?category=slug links move to the clean /category/slug URL.
  if (typeof sp.category === "string" && /^[a-z0-9-]{1,60}$/.test(sp.category)) {
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "category" && typeof v === "string") rest.set(k, v);
    permanentRedirect(`/category/${sp.category}${rest.size ? `?${rest}` : ""}`);
  }
  const [categories, settings] = await Promise.all([listCategories(), getSettings()]);
  return <ShopView filters={parseShopFilters(sp, null)} categories={categories} settings={settings} whatsapp={resolveWhatsAppNumber(settings.whatsapp)} />;
}
