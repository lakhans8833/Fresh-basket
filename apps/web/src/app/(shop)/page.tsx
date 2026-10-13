import { listCategories, listProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { CategoryStrip, Hero, HowItWorks, ProductRail, SeasonalBanner } from "@/components/home/sections";

export default async function HomePage() {
  const [settings, categories, featured, seasonal] = await Promise.all([
    getSettings(),
    listCategories(),
    listProducts({ featured: true, limit: 8 }),
    listProducts({ seasonal: true, limit: 4 }),
  ]);
  return (
    <>
      <Hero settings={settings} />
      <CategoryStrip categories={categories} />
      <ProductRail id="favourites" title="Fresh favourites" href="/shop" products={featured} />
      <SeasonalBanner />
      <ProductRail id="seasonal" eyebrow="Seasonal picks" title="In season now" href="/shop?seasonal=1" products={seasonal} />
      <HowItWorks />
    </>
  );
}
