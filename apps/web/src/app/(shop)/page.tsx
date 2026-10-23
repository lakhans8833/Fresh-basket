import type { Metadata } from "next";
import { buildWhatsAppUrl, formatINR, type PromoBanner } from "@freshbasket/shared";
import { bestSavingPct, bestSellerIds, dealsFrom, listBuyAgain, listCategories, listProducts, priceBucketsFrom } from "@/lib/catalog";
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
  // One catalogue read for the whole page (deals, price ranges, rails are all derived from it),
  // so the home page needs only a handful of database round trips.
  const [categories, all, bestIds, areas, slots, adminBanners, heroBanners, buyAgain] = await Promise.all([
    safe(listCategories(), []),
    safe(listProducts({}), []),
    safe(bestSellerIds(8), []),
    safe(listActiveDeliveryAreas(), []),
    safe(listActiveSlots(), []),
    safe(listActiveBanners(), []),
    safe(listActiveBanners(4, "hero"), []),
    session ? safe(listBuyAgain(session.userId, 8), { products: [], lastVariant: {} }) : Promise.resolve({ products: [], lastVariant: {} }),
  ]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const bestSellers = bestIds.map((id) => byId.get(id)).filter((p): p is (typeof all)[number] => Boolean(p));
  const featured = all.filter((p) => p.featured).slice(0, 8);
  const seasonalAll = all.filter((p) => p.seasonal);
  const seasonal = seasonalAll.slice(0, 4);
  const seasonalCount = seasonalAll.length;
  const deals = dealsFrom(all);
  const priceBuckets = priceBucketsFrom(all);
  const inCategory = (id: string) => all.filter((p) => p.categoryId === id).slice(0, 4);

  const leafy = categories.find((c) => /leaf|green/.test(c.slug));
  // Extra rails appear only when the store actually has these categories with products in them.
  const fruits = categories.find((c) => /fruit/.test(c.slug) && !/exotic/.test(c.slug) && (c.productCount ?? 0) > 0);
  const combos = categories.find((c) => /combo|value|pack/.test(c.slug) && (c.productCount ?? 0) > 0);
  const leafyProducts = leafy ? inCategory(leafy.id) : [];
  const fruitProducts = fruits ? inCategory(fruits.id) : [];
  const comboProducts = combos ? inCategory(combos.id) : [];
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

  // Free delivery is promised in the hero only when every delivery area has the same amount set.
  const freeAboves = [...new Set(areas.map((a) => a.freeAbove))];
  const freeAbove = freeAboves.length === 1 ? freeAboves[0] : null;
  const pinCount = areas.length;

  const allSlides: HeroSlide[] = [
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
    // Slides added in Admin → Banners ("Home hero slider").
    ...heroBanners.map((b): HeroSlide => ({
      id: `banner-${b.id}`,
      badge: b.badge || storeConfig.serviceArea,
      title: [b.title, ""],
      subtitle: b.subtitle ?? "",
      cta: { href: b.linkUrl, label: b.ctaLabel || "Shop now" },
      image: b.imageUrl ?? "/images/site/banner-market.webp",
      imageAlt: "",
    })),
    ...(freeAbove != null && freeAbove > 0
      ? [{
          id: "free-delivery",
          badge: `${pinCount} delivery ${pinCount === 1 ? "area" : "areas"}`,
          title: ["Free Delivery", `on Orders Above ${formatINR(freeAbove)}`] as [string, string],
          subtitle: "Fill your basket and the delivery charge disappears at checkout.",
          cta: { href: "/shop", label: "Fill my basket" },
          secondary: { href: "/delivery-policy", label: "Delivery areas" },
          image: "/images/site/banner-market.webp",
          imageAlt: "Fresh vegetables at a market stall",
        } satisfies HeroSlide]
      : []),
    ...(whatsapp
      ? [{
          id: "whatsapp",
          badge: "Easy ordering",
          title: ["Order on WhatsApp", "in One Tap"] as [string, string],
          subtitle: "Fill your cart, add your address and send the order to us on WhatsApp.",
          cta: { href: "/shop", label: "Start shopping" },
          secondary: { href: "/order", label: "Order on WhatsApp" },
          image: "/images/site/hero-shopping-basket.webp",
          imageAlt: "A shopping basket filled with fresh vegetables",
        } satisfies HeroSlide]
      : []),
    {
      id: "weights",
      badge: "Your choice",
      title: ["Pick Your Pack Size", "& Delivery Slot"],
      subtitle: "Buy just what you need — 250 g, 500 g, 1 kg and more.",
      cta: { href: "/shop", label: "Start shopping" },
      image: "/images/site/banner-roots.webp",
      imageAlt: "Fresh root vegetables",
    },
  ];
  const slides = allSlides.slice(0, 7);

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
      {combos ? <ProductRail id="combos" title={combos.name} href={`/category/${combos.slug}`} products={comboProducts} /> : null}
      {fruits ? <ProductRail id="fruits" title={fruits.name} href={`/category/${fruits.slug}`} products={fruitProducts} /> : null}
      {leafy ? <ProductRail id="leafy" title={leafy.name} href={`/category/${leafy.slug}`} products={leafyProducts} /> : null}
      <PriceTiles buckets={priceBuckets} />
      <ProductRail id="seasonal" title="In Season Now" href="/shop?seasonal=1" products={seasonal} />
      <DeliveryInfo serviceArea={area} areas={areas} slots={slots} codEnabled={settings.codEnabled} whatsapp={Boolean(whatsapp)} />
      <HowItWorks whatsapp={Boolean(whatsapp)} />
      {whatsapp ? <WhatsAppBand whatsappUrl={buildWhatsAppUrl(whatsapp, `Hi ${settings.storeName}, I'd like to place an order.`)} /> : null}
    </>
  );
}
