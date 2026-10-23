import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, CalendarClock, Leaf, MapPin, ShoppingBasket, Truck } from "lucide-react";
import { formatINR, formatSlotTime, type Category, type DeliveryArea, type ProductSummary, type SlotRule } from "@freshbasket/shared";
import { ProductCard } from "../product/product-card";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { RailScroller } from "./rail-scroller";
import { cn } from "../ui/cn";

function SectionHeader({ id, title, href, eyebrow, linkLabel = "see all" }: { id: string; title: string; href?: string; eyebrow?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-bold leading-tight text-ink sm:text-[1.375rem]">{title}</h2>
        {/* A short line that says something about the section (e.g. "From your past orders"), not a label. */}
        {eyebrow ? <p className="mt-0.5 text-[0.8125rem] text-muted">{eyebrow}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="-my-2 shrink-0 rounded-lg px-2 py-2 text-[0.9375rem] font-semibold text-leaf-600 hover:bg-lime-50 sm:text-base">
          {linkLabel}<span className="sr-only"> — {title}</span>
        </Link>
      ) : null}
    </div>
  );
}

/** Quick-commerce category grid: small square tiles on a soft green tint, the name under each. */
export function CategoryGrid({ categories, seasonalCount }: { categories: Category[]; seasonalCount: number }) {
  const tiles = [
    ...categories.map((c) => ({ key: c.slug, href: `/category/${c.slug}`, name: c.name, count: c.productCount ?? 0, image: c.imageUrl })),
    ...(seasonalCount > 0 ? [{ key: "seasonal", href: "/shop?seasonal=1", name: "In Season Now", count: seasonalCount, image: "/images/site/tile-seasonal.webp" }] : []),
  ];
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="cat-heading" className="container-page mt-6 md:mt-8">
      <SectionHeader id="cat-heading" title="Shop by category" href="/categories" />
      <ul className="grid grid-cols-4 gap-x-2.5 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] sm:gap-x-4 lg:grid-cols-[repeat(auto-fill,minmax(7.75rem,1fr))]">
        {tiles.map((t) => (
          <li key={t.key}>
            <Link href={t.href} className="group flex flex-col items-center text-center">
              <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-lime-50 ring-1 ring-lime-100 transition group-hover:ring-forest-700/30">
                {t.image ? (
                  <Image src={t.image} alt="" fill sizes="(min-width: 1024px) 9rem, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <span className="grid h-full place-items-center text-forest-700"><Leaf className="size-8" aria-hidden /></span>
                )}
              </span>
              <span className="mt-1.5 line-clamp-2 text-xs font-semibold leading-tight text-ink sm:text-[0.8125rem]">{t.name}</span>
              <span className="sr-only">({t.count} {t.count === 1 ? "item" : "items"})</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A row of product cards: swipe sideways on phones, arrow buttons on larger screens. */
export function ProductRail({
  id, title, eyebrow, href, products, className, preferVariant,
}: { id: string; title: string; eyebrow?: string; href?: string; products: ProductSummary[]; layout?: "grid" | "compact"; className?: string; preferVariant?: Record<string, string> }) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className={cn("container-page mt-7 md:mt-9", className)}>
      <SectionHeader id={id} title={title} eyebrow={eyebrow} href={href} />
      <RailScroller label={title}>
        {products.map((p, i) => (
          <li key={p.id} className="w-[9.5rem] shrink-0 snap-start sm:w-44 lg:w-[11.25rem]">
            <ProductCard product={p} index={i} preferVariantId={preferVariant?.[p.id]} />
          </li>
        ))}
      </RailScroller>
    </section>
  );
}

/** Signed-in customers: products from their past orders, opening on the pack they bought last. */
export function BuyAgainRail({ products, lastVariant, href = "/account/buy-again" }: { products: ProductSummary[]; lastVariant: Record<string, string>; href?: string }) {
  return <ProductRail id="buy-again" title="Buy Again" eyebrow="From your past orders" href={href} products={products} preferVariant={lastVariant} className="mt-6 md:mt-8" />;
}

/** "Shop by price" tiles; only ranges that have products. Counts come from the live catalogue. */
export function PriceTiles({ buckets }: { buckets: { key: string; label: string; count: number }[] }) {
  const shown = buckets.filter((b) => b.count > 0);
  if (shown.length < 2) return null;
  return (
    <section aria-labelledby="price-heading" className="container-page mt-12 md:mt-16">
      <SectionHeader id="price-heading" title="Shop by Price" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((b, i) => (
          <li key={b.key}>
            <Link
              href={`/shop?price=${encodeURIComponent(b.key)}`}
              className={cn(
                "group flex h-full flex-col justify-between gap-3 rounded-[var(--radius-card)] border p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-5",
                ["border-lime-300 bg-lime-50", "border-line bg-white", "border-[#f0d9a6] bg-[#fdf6e7]", "border-forest-800 bg-forest-800 text-white"][i % 4],
              )}
            >
              <span className="text-[1.375rem] font-bold leading-tight sm:text-2xl">{b.label}</span>
              <span className={cn("inline-flex items-center gap-1 text-sm font-medium", i % 4 === 3 ? "text-white/85" : "text-muted")}>
                {b.count} {b.count === 1 ? "item" : "items"} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WhatsAppBand({ whatsappUrl }: { whatsappUrl: string }) {
  return (
    // The last block on the home page: sits flush on the footer (cancels the footer's top margin)
    // instead of leaving an empty strip between the green band and the footer.
    <section className="mb-[-4rem] mt-14 bg-forest-800 md:mb-[-5rem] md:mt-20">
      <div className="container-page flex flex-col items-center justify-center gap-4 py-6 text-center text-white md:flex-row md:gap-6 md:text-left">
        <WhatsAppIcon className="size-10 shrink-0 text-white" />
        <p className="text-xl font-semibold md:whitespace-nowrap">Order on WhatsApp</p>
        <span aria-hidden className="hidden h-6 w-px shrink-0 bg-white/30 md:block" />
        <p className="text-white/85 md:flex-1">Fill your cart, pick a delivery slot and send the order to us on WhatsApp.</p>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 lg:flex-nowrap">
          <Link href="/order" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-forest-800 hover:bg-lime-100">
            <WhatsAppIcon className="size-5 text-whatsapp-dark" /> Order on WhatsApp
          </Link>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/50 px-4 text-sm font-semibold text-white hover:bg-white/10">
            Chat with us
          </a>
        </div>
      </div>
    </section>
  );
}

/** Delivery facts from the store's real configuration (areas, slots, payment options). */
export function DeliveryInfo({
  serviceArea, areas, slots, codEnabled, whatsapp,
}: { serviceArea: string; areas: DeliveryArea[]; slots: SlotRule[]; codEnabled: boolean; whatsapp: boolean }) {
  const fees = areas.map((a) => a.fee);
  const minFee = fees.length ? Math.min(...fees) : null;
  const frees = areas.map((a) => a.freeAbove).filter((x): x is number => x !== null);
  const cards = [
    { icon: <MapPin className="size-6" aria-hidden />, title: "Where we deliver", text: `${serviceArea}. Check your PIN code at checkout.`, href: "/delivery-policy", link: "See delivery areas" },
    slots.length
      ? { icon: <CalendarClock className="size-6" aria-hidden />, title: "Delivery slots", text: slots.slice(0, 3).map((s) => `${s.label} ${formatSlotTime(s.startTime)}–${formatSlotTime(s.endTime)}`).join(" · "), href: "/delivery-policy", link: "Slot timings" }
      : null,
    {
      icon: <Truck className="size-6" aria-hidden />,
      title: "Delivery charges",
      text: minFee === null ? "Shown at checkout for your PIN code." : `${minFee === 0 ? "Free in some areas" : `From ${formatINR(minFee)}`}${frees.length ? `, free above ${formatINR(Math.min(...frees))} in eligible areas` : ""}.`,
      href: "/delivery-policy",
      link: "Charges by area",
    },
    codEnabled
      ? { icon: <Banknote className="size-6" aria-hidden />, title: "Pay on delivery", text: whatsapp ? "Order on WhatsApp or online and pay cash when it arrives." : "Pay cash when your order arrives.", href: "/help", link: "Payment FAQs" }
      : { icon: <ShoppingBasket className="size-6" aria-hidden />, title: "Easy ordering", text: "Add to cart and check out in a minute.", href: "/help", link: "How ordering works" },
  ].filter(Boolean) as { icon: React.ReactNode; title: string; text: string; href: string; link: string }[];

  return (
    <section aria-labelledby="delivery-info" className="container-page mt-12 md:mt-16">
      <SectionHeader id="delivery-info" title="Delivery information" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.title} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <span className="grid size-12 place-items-center rounded-full bg-lime-100 text-forest-800">{c.icon}</span>
            <h3 className="mt-3 font-sans text-base font-semibold text-ink">{c.title}</h3>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{c.text}</p>
            <Link href={c.href} className="mt-1 inline-flex items-center gap-1 py-2 text-sm font-semibold text-forest-800 hover:underline">{c.link} <ArrowRight className="size-3.5" aria-hidden /></Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HowItWorks({ whatsapp }: { whatsapp: boolean }) {
  const steps = [
    { n: "1", title: "Fill your cart", text: "Browse by category, pick the pack size you need and add it to your cart." },
    whatsapp
      ? { n: "2", title: "Order on WhatsApp", text: "Enter your address and PIN code, then send the order to us on WhatsApp in one tap." }
      : { n: "2", title: "Check out", text: "Enter your PIN code, pick a delivery slot and place the order." },
    { n: "3", title: "Get it delivered", text: "We confirm your order and deliver to your doorstep." },
  ];
  return (
    <section aria-labelledby="how" className="container-page mt-12 md:mt-16">
      <SectionHeader id="how" title="How it works" />
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-forest-800 text-lg font-bold text-white">{s.n}</span>
            <span>
              <h3 className="font-sans text-base font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
