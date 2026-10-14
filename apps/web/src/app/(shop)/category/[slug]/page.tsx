import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { ShopView, parseShopFilters } from "@/components/product/shop-view";

type Params = Promise<{ slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

async function findCategory(slug: string) {
  return (await listCategories()).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const c = await findCategory(slug);
  if (!c) return { title: "Category not found" };
  const description = `${c.description ? `${c.description}. ` : ""}Buy ${c.name.toLowerCase()} online with home delivery in ${storeConfig.serviceArea}.`;
  return {
    title: `${c.name} — buy online in ${storeConfig.defaultCity}`,
    description,
    alternates: { canonical: `/category/${c.slug}` },
    openGraph: { title: c.name, description, images: c.imageUrl ? [{ url: c.imageUrl, alt: c.name }] : undefined },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { slug } = await params;
  const [categories, settings] = await Promise.all([listCategories(), getSettings()]);
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  return (
    <ShopView
      filters={parseShopFilters(await searchParams, category)}
      categories={categories}
      settings={settings}
      whatsapp={resolveWhatsAppNumber(settings.whatsapp)}
    />
  );
}
