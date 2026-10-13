import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, Scale, Wallet, Leaf, ShieldCheck, Truck } from "lucide-react";
import type { Category, ProductSummary, StoreSettings } from "@freshbasket/shared";
import { ButtonLink } from "../ui/button";
import { ProductCard } from "../product/product-card";
import { cn } from "../ui/cn";

export function Hero({ settings }: { settings: StoreSettings }) {
  const trust = [
    { icon: Scale, title: "Choose your weight", sub: "500 g, 1 kg & more" },
    { icon: CalendarClock, title: "Pick a slot", sub: "Delivery when it suits you" },
    settings.codEnabled
      ? { icon: Wallet, title: "Cash on delivery", sub: "Or pay online" }
      : { icon: ShieldCheck, title: "Secure checkout", sub: "Verified online payments" },
  ];
  return (
    <section className="container-page pt-4 md:pt-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#f6f1e4] via-[#f3eedf] to-[#ece4cf]">
        <div className="grid items-center lg:grid-cols-[1fr_1.05fr]">
          <div className="relative z-10 px-6 pb-8 pt-10 sm:px-10 md:pb-12 lg:py-16 lg:pl-14 lg:pr-4">
            <p className="eyebrow flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span>Fresh vegetables</span>
              <span aria-hidden className="h-3 w-px bg-muted/40" />
              <span>Doorstep delivery</span>
              <span aria-hidden className="h-3 w-px bg-muted/40" />
              <span>Your slot</span>
            </p>
            <h1 className="mt-4 text-[2.9rem] font-semibold leading-[0.95] tracking-[-0.03em] text-forest-900 sm:text-6xl lg:text-[4.6rem]">
              Freshness
              <br />
              at your
              <br />
              doorstep.
            </h1>
            <p className="mt-5 max-w-sm text-lg text-ink-soft">{settings.tagline || "Your everyday vegetables, just a tap away."}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <ButtonLink href="/shop" size="lg">
                Shop fresh <ArrowRight className="size-5" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/shop?seasonal=1" variant="ghost" size="lg" className="hidden sm:inline-flex">
                In season now
              </ButtonLink>
            </div>
            <ul className="mt-9 grid max-w-lg grid-cols-3 gap-3">
              {trust.map(({ icon: Icon, title, sub }) => (
                <li key={title} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-forest-800/15 bg-white/60 text-forest-800">
                    <Icon className="size-[1.1rem]" aria-hidden />
                  </span>
                  <span className="text-[0.8125rem] leading-tight">
                    <span className="block font-semibold text-ink">{title}</span>
                    <span className="text-muted">{sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative -mt-4 aspect-[5/4] w-full lg:mt-0 lg:aspect-auto lg:h-full lg:min-h-[34rem]">
            <Image
              src="/images/dev/hero-basket.jpg"
              alt="A paper bag of fresh vegetables — broccoli, carrots, tomatoes and greens"
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover object-center [mask-image:linear-gradient(to_bottom,transparent,black_18%)] lg:[mask-image:linear-gradient(to_right,transparent,black_16%)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function CategoryStrip({ categories, active }: { categories: Category[]; active?: string }) {
  const tiles = [
    { href: "/shop", name: "All vegetables", sub: "View all", image: "/images/dev/cat-all.jpg", key: "all" },
    ...categories.map((c) => ({ href: `/shop?category=${c.slug}`, name: c.name, sub: c.description ?? `${c.productCount ?? 0} items`, image: c.imageUrl, key: c.slug })),
    { href: "/shop?seasonal=1", name: "Seasonal", sub: "In season now", image: "/images/dev/cat-seasonal.jpg", key: "seasonal" },
  ];
  return (
    <section aria-labelledby="cat-heading" className="container-page mt-8 md:mt-10">
      <h2 id="cat-heading" className="sr-only">Shop by category</h2>
      <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {tiles.map((t) => {
          const on = (active ?? "all") === t.key;
          return (
            <li key={t.key} className="w-[44%] shrink-0 snap-start sm:w-auto">
              <Link
                href={t.href}
                className={cn(
                  "flex h-full items-center gap-3 rounded-2xl border p-2.5 pr-3 transition-colors",
                  on ? "border-forest-800 bg-forest-800 text-white" : "border-line bg-white hover:border-forest-700/30 hover:bg-sage-50",
                )}
              >
                <span className={cn("relative size-12 shrink-0 overflow-hidden rounded-xl", on ? "bg-white/10" : "bg-sage-50")}>
                  {t.image ? <Image src={t.image} alt="" fill sizes="48px" className="object-cover" /> : <Leaf className="m-3 size-6 text-leaf-500" />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-semibold", on ? "text-white" : "text-ink")}>{t.name}</span>
                  <span className={cn("block truncate text-xs", on ? "text-white/70" : "text-muted")}>{t.sub}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProductRail({ id, title, eyebrow, href, products }: { id: string; title: string; eyebrow?: string; href: string; products: ProductSummary[] }) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className="container-page mt-12 md:mt-16">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
          <h2 id={id} className="text-[1.9rem] font-semibold leading-none text-forest-900 md:text-[2.4rem]">
            {title}
          </h2>
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-forest-800 hover:bg-sage-100">
          View all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  );
}

export function SeasonalBanner() {
  const points = [
    { icon: Leaf, text: "Seasonal produce, updated as availability changes" },
    { icon: CalendarClock, text: "Choose a delivery slot that suits you" },
    { icon: Truck, text: "Delivered to your doorstep" },
  ];
  return (
    <section className="container-page mt-14 md:mt-20">
      <div className="relative overflow-hidden rounded-[2rem] bg-forest-800 text-white">
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.1fr_1.2fr]">
          <div className="relative z-10 px-6 pt-9 sm:px-10 lg:py-10 lg:pr-0">
            <p className="eyebrow text-lime-300">Seasonal goodness</p>
            <h2 className="mt-2 text-[2.2rem] font-semibold leading-[1] sm:text-5xl">
              A basket full
              <br /> of goodness.
            </h2>
          </div>
          <div className="relative h-44 sm:h-56 lg:h-full lg:min-h-56">
            <Image src="/images/dev/seasonal-basket.jpg" alt="A wicker basket of mixed vegetables" fill sizes="(min-width: 1024px) 35vw, 100vw" className="object-cover [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]" />
          </div>
          <div className="relative z-10 flex flex-col gap-6 px-6 pb-9 sm:px-10 lg:py-10 lg:pl-0">
            <ul className="grid grid-cols-3 gap-4">
              {points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex flex-col gap-2 text-[0.8125rem] leading-snug text-white/80">
                  <span className="grid size-10 place-items-center rounded-full border border-white/20 text-lime-300">
                    <Icon className="size-[1.1rem]" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <div>
              <ButtonLink href="/shop?seasonal=1" variant="lime">
                Explore seasonal <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { n: "01", title: "Fill your basket", text: "Browse by category, pick the weight you need and add to basket." },
    { n: "02", title: "Choose a slot", text: "Enter your PIN code, pick a delivery date and time slot that suits you." },
    { n: "03", title: "Track to your door", text: "Pay online or on delivery and follow your order from packing to doorstep." },
  ];
  return (
    <section aria-labelledby="how" className="container-page mt-16 md:mt-20">
      <h2 id="how" className="text-[1.9rem] font-semibold text-forest-900 md:text-[2.4rem]">How it works</h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="rounded-[var(--radius-card)] border border-line bg-white p-6">
            <span className="font-display text-3xl font-semibold text-leaf-500">{s.n}</span>
            <h3 className="mt-3 font-sans text-lg font-semibold text-ink">{s.title}</h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
