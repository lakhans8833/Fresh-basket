import type { Metadata } from "next";
import { buildWhatsAppUrl } from "@freshbasket/shared";
import { listBestSellers, listCategories, listProducts } from "@/lib/catalog";
import { listActiveDeliveryAreas, listActiveSlots } from "@/lib/delivery";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { HeroCarousel, type HeroSlide } from "@/components/home/hero-carousel";
import { CategoryGrid, DeliveryInfo, HowItWorks, ProductRail, WhatsAppBand } from "@/components/home/sections";
import { BenefitsStrip, storeBenefits } from "@/components/layout/benefits";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const safe = <T,>(p: Promise<T>, fallback: T) => p.catch((e) => (console.error("[home]", e), fallback));

export default async function HomePage() {
  const settings = await getSettings();
  const [categories, featured, bestSellers, seasonal, areas, slots] = await Promise.all([
    safe(listCategories(), []),
    safe(listProducts({ featured: true, limit: 8 }), []),
    safe(listBestSellers(8), []),
    safe(listProducts({ seasonal: true, limit: 4 }), []),
    safe(listActiveDeliveryAreas(), []),
    safe(listActiveSlots(), []),
  ]);
  const leafy = categories.find((c) => /leaf|green/.test(c.slug));
  const leafyProducts = leafy ? await safe(listProducts({ category: leafy.slug, limit: 4 }), []) : [];
  const seasonalCount = seasonal.length ? (await safe(listProducts({ seasonal: true }), [])).length : 0;
  const whatsapp = resolveWhatsAppNumber(settings.whatsapp);
  const area = storeConfig.serviceArea;

  const slides: HeroSlide[] = [
    {
      id: "fresh",
      badge: `Delivering in ${area}`,
      title: ["Fresh Vegetables", "Delivered to Your Home"],
      subtitle: settings.tagline || "Fresh Vegetables, Healthy Life",
      cta: { href: "/shop", label: "Shop Now" },
      secondary: leafy ? { href: `/category/${leafy.slug}`, label: leafy.name } : undefined,
      image: "/images/dev/hero-basket-wide.jpg",
      imageAlt: "A wicker basket full of fresh vegetables — tomatoes, peppers, carrots, broccoli and greens",
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
          image: "/images/dev/hero-basket.jpg",
          imageAlt: "A paper bag of fresh vegetables",
        }
      : {
          id: "weights",
          badge: "Your choice",
          title: ["Pick Your Pack Size", "& Delivery Slot"],
          subtitle: "Buy just what you need — 250 g, 500 g, 1 kg and more.",
          cta: { href: "/shop", label: "Start shopping" },
          image: "/images/dev/hero-basket.jpg",
          imageAlt: "A paper bag of fresh vegetables",
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
      <CategoryGrid categories={categories} seasonalCount={seasonalCount} />
      {bestSellers.length ? (
        <ProductRail id="best" title="Best Selling Vegetables" href="/shop" products={bestSellers} layout="compact" />
      ) : (
        <ProductRail id="favourites" title="Fresh Favourites" href="/shop" products={featured} layout="compact" />
      )}
      {leafy ? <ProductRail id="leafy" eyebrow="Greens for every kitchen" title={leafy.name} href={`/category/${leafy.slug}`} products={leafyProducts} /> : null}
      <ProductRail id="seasonal" eyebrow="Seasonal picks" title="In Season Now" href="/shop?seasonal=1" products={seasonal} />
      <DeliveryInfo serviceArea={area} areas={areas} slots={slots} codEnabled={settings.codEnabled} whatsapp={Boolean(whatsapp)} />
      <HowItWorks whatsapp={Boolean(whatsapp)} />
      {whatsapp ? <WhatsAppBand whatsappUrl={buildWhatsAppUrl(whatsapp, `Hi ${settings.storeName}, I'd like to order fresh vegetables.`)} /> : null}
    </>
  );
}
