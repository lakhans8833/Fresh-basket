import type { Metadata } from "next";
import { buildWhatsAppUrl, type PromoBanner } from "@freshbasket/shared";
import { bestSavingPct, listBestSellers, listBuyAgain, listCategories, listDeals, listProducts, priceBucketCounts } from "@/lib/catalog";
import { listActiveBanners } from "@/lib/banners";
import { getSession } from "@/lib/auth";
import { listActiveDeliveryAreas, listActiveSlots } from "@/lib/delivery";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { HeroCarousel, type HeroSlide } from "@/components/home/hero-carousel";
import { BuyAgainRail, CategoryGrid, DeliveryInfo, HowItWorks, PriceTiles, ProductRail, WhatsAppBand } from "@/components/home/sections";
import { PromoStrip } from "@/components/home/promo-strip";
import { BenefitsStrip, storeBenefits } from "@/components/layout/benefits";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const safe = <T,>(p: Promise<T>, fallback: T) => p.catch((e) => (console.error("[home]", e), fallback));

export default async function HomePage() {
  const settings = await getSettings();
  const session = await getSession().catch(() => null);
  const [categories, featured, bestSellers, seasonal, areas, slots, adminBanners, deals, priceBuckets, buyAgain] = await Promise.all([
    safe(listCategories(), []),
    safe(listProducts({ featured: true, limit: 8 }), []),
    safe(listBestSellers(8), []),
    safe(listProducts({ seasonal: true, limit: 4 }), []),
    safe(listActiveDeliveryAreas(), []),
    safe(listActiveSlots(), []),
    safe(listActiveBanners(), []),
    safe(listDeals(), []),
    safe(priceBucketCounts(), []),
    session ? safe(listBuyAgain(session.userId, 8), { products: [], lastVariant: {} }) : Promise.resolve({ products: [], lastVariant: {} }),
  ]);
  const leafy = categories.find((c) => /leaf|green/.test(c.slug));
  // Extra rails appear only when the store actually has these categories with products in them.
  const fruits = categories.find((c) => /fruit/.test(c.slug) && !/exotic/.test(c.slug) && (c.productCount ?? 0) > 0);
  const combos = categories.find((c) => /combo|value|pack/.test(c.slug) && (c.productCount ?? 0) > 0);
  const [leafyProducts, fruitProducts, comboProducts] = await Promise.all([
    leafy ? safe(listProducts({ category: leafy.slug, limit: 4 }), []) : Promise.resolve([]),
    fruits ? safe(listProducts({ category: fruits.slug, limit: 4 }), []) : Promise.resolve([]),
    combos ? safe(listProducts({ category: combos.slug, limit: 4 }), []) : Promise.resolve([]),
  ]);
  const seasonalCount = seasonal.length ? (await safe(listProducts({ seasonal: true }), [])).length : 0;
  const whatsapp = resolveWhatsAppNumber(settings.whatsapp);
  const area = storeConfig.serviceArea;

  // Offer banners: the ones set in Admin → Banners; if there are none, honest ones built from
  // what the store really has right now (real discounts, combos, seasonal products, WhatsApp).
  const autoBanners: PromoBanner[] = [];
  if (deals.length) {
    const top = Math.max(...deals.map(bestSavingPct));
    autoBanners.push({ id: "auto-deals", title: "Deals of the Day", subtitle: `Up to ${top}% off on ${deals.length} ${deals.length === 1 ? "item" : "items"}`, linkUrl: "/deals", theme: "amber", imageUrl: deals[0]?.imageUrl ?? "/images/site/banner-market.webp" });
  }
  if (combos) autoBanners.push({ id: "auto-combos", title: combos.name, subtitle: `${combos.productCount} ready-made ${combos.productCount === 1 ? "pack" : "packs"}`, linkUrl: `/category/${combos.slug}`, theme: "lime", imageUrl: combos.imageUrl ?? "/images/site/tile-all.webp" });
  if (seasonalCount > 0) autoBanners.push({ id: "auto-seasonal", title: "In Season Now", subtitle: `${seasonalCount} fresh seasonal ${seasonalCount === 1 ? "pick" : "picks"}`, linkUrl: "/shop?seasonal=1", theme: "green", imageUrl: "/images/site/tile-seasonal.webp" });
  if (fruits) autoBanners.push({ id: "auto-fruits", title: fruits.name, subtitle: `${fruits.productCount} ${fruits.productCount === 1 ? "item" : "items"} to choose from`, linkUrl: `/category/${fruits.slug}`, theme: "ivory", imageUrl: fruits.imageUrl ?? "/images/site/banner-roots.webp" });
  if (whatsapp && autoBanners.length < 4) autoBanners.push({ id: "auto-wa", title: "Order on WhatsApp", subtitle: "Fill your cart and send it to us in one tap", linkUrl: "/cart", theme: "green", imageUrl: "/images/site/hero-shopping-basket.webp" });
  const banners = adminBanners.length ? adminBanners : autoBanners.slice(0, 4);

  const slides: HeroSlide[] = [
    {
      id: "fresh",
      badge: `Delivering in ${area}`,
      title: ["Fresh Vegetables", "Delivered to Your Home"],
      subtitle: settings.tagline || "Fresh Vegetables, Healthy Life",
      cta: { href: "/shop", label: "Shop Now" },
      secondary: leafy ? { href: `/category/${leafy.slug}`, label: leafy.name } : undefined,
      image: "/images/site/hero-veg-basket.webp",
      imageAlt: "A basket of fresh vegetables — limes, spring onions, ginger, chillies and greens",
      script: storeConfig.secondaryTagline,
    },
    whatsapp
      ? {
          id: "whatsapp",
          badge: "Easy ordering",
          title: ["Order on WhatsApp", "in One Tap"],
          subtitle: "Fill your cart, add your address and send the order to us on WhatsApp.",
          cta: { href: "/shop", label: "Start shopping" },
          secondary: { href: "/help", label: "How it works" },
          image: "/images/site/hero-shopping-basket.webp",
          imageAlt: "A shopping basket filled with fresh vegetables",
        }
      : {
          id: "weights",
          badge: "Your choice",
          title: ["Pick Your Pack Size", "& Delivery Slot"],
          subtitle: "Buy just what you need — 250 g, 500 g, 1 kg and more.",
          cta: { href: "/shop", label: "Start shopping" },
          image: "/images/site/hero-shopping-basket.webp",
          imageAlt: "A shopping basket filled with fresh vegetables",
        },
  ];

  return (
    <>
      <h1 className="sr-only">{settings.storeName} — fresh vegetables delivered in {area}</h1>
      <HeroCarousel slides={slides} />
      <div className="border-b border-line bg-sage-50">
        <div className="container-page py-5">
          <BenefitsStrip benefits={storeBenefits(settings, { whatsapp: Boolean(whatsapp), serviceArea: area })} tone="plain" />
        </div>
      </div>
      <PromoStrip banners={banners} />
      <BuyAgainRail products={buyAgain.products} lastVariant={buyAgain.lastVariant} />
      <CategoryGrid categories={categories} seasonalCount={seasonalCount} />
      {bestSellers.length ? (
        <ProductRail id="best" title="Best Sellers" href="/shop" products={bestSellers} layout="compact" />
      ) : (
        <ProductRail id="favourites" title="Fresh Favourites" href="/shop" products={featured} layout="compact" />
      )}
      {combos ? <ProductRail id="combos" eyebrow="Save more" title={combos.name} href={`/category/${combos.slug}`} products={comboProducts} /> : null}
      {fruits ? <ProductRail id="fruits" eyebrow="Fresh & juicy" title={fruits.name} href={`/category/${fruits.slug}`} products={fruitProducts} /> : null}
      {leafy ? <ProductRail id="leafy" eyebrow="Greens for every kitchen" title={leafy.name} href={`/category/${leafy.slug}`} products={leafyProducts} /> : null}
      <PriceTiles buckets={priceBuckets} />
      <ProductRail id="seasonal" eyebrow="Seasonal picks" title="In Season Now" href="/shop?seasonal=1" products={seasonal} />
      <DeliveryInfo serviceArea={area} areas={areas} slots={slots} codEnabled={settings.codEnabled} whatsapp={Boolean(whatsapp)} />
      <HowItWorks whatsapp={Boolean(whatsapp)} />
      {whatsapp ? <WhatsAppBand whatsappUrl={buildWhatsAppUrl(whatsapp, `Hi ${settings.storeName}, I'd like to place an order.`)} /> : null}
    </>
  );
}
