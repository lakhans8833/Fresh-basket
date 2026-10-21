import Link from "next/link";
import { Suspense } from "react";
import { Apple, Carrot, Check, ChevronRight, Home, Leaf, LeafyGreen, SearchX, Sprout, Truck, Banknote, ShieldCheck } from "lucide-react";
import type { Category, StoreSettings } from "@freshbasket/shared";
import { DISCOUNT_BUCKETS, listProducts, PRICE_BUCKETS, type SortKey } from "@/lib/catalog";
import { storeConfig } from "@/config/store";
import { ProductCard } from "./product-card";
import { SortSelect } from "./shop-controls";
import { PageBanner } from "../layout/page-banner";
import { EmptyState } from "../ui/feedback";
import { ButtonLink } from "../ui/button";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { cn } from "../ui/cn";

export const SORTS: SortKey[] = ["featured", "price_asc", "price_desc", "name"];

export function categoryIcon(slug: string | null | undefined, className = "size-5") {
  const s = slug ?? "";
  if (/leaf|green|saag|palak/.test(s)) return <LeafyGreen className={className} aria-hidden />;
  if (/root|tuber|carrot/.test(s)) return <Carrot className={className} aria-hidden />;
  if (/season/.test(s)) return <Sprout className={className} aria-hidden />;
  if (/fruit/.test(s)) return <Apple className={className} aria-hidden />;
  return <Leaf className={className} aria-hidden />;
}

export interface ShopFilters {
  q?: string;
  category?: Category | null;
  seasonal: boolean;
  inStock: boolean;
  sort: SortKey;
  prices: string[];
  discounts: string[];
}

export function parseShopFilters(sp: Record<string, string | string[] | undefined>, category: Category | null): ShopFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const sortParam = one("sort") as SortKey | undefined;
  return {
    q: one("q")?.trim().slice(0, 60) || undefined,
    category,
    seasonal: one("seasonal") === "1",
    inStock: one("inStock") === "1",
    sort: sortParam && SORTS.includes(sortParam) ? sortParam : "featured",
    prices: (one("price") ?? "").split(",").filter((p) => PRICE_BUCKETS.some((b) => b.key === p)),
    discounts: (one("off") ?? "").split(",").filter((p) => DISCOUNT_BUCKETS.some((b) => b.key === p)),
  };
}

function hrefFor(f: ShopFilters, patch: Partial<{ category: string | null; q: string | null; seasonal: boolean; inStock: boolean; sort: SortKey; prices: string[]; discounts: string[] }>) {
  const category = patch.category !== undefined ? patch.category : f.category?.slug ?? null;
  const next = new URLSearchParams();
  const q = patch.q !== undefined ? patch.q : f.q;
  if (q) next.set("q", q);
  if (patch.seasonal ?? f.seasonal) next.set("seasonal", "1");
  if (patch.inStock ?? f.inStock) next.set("inStock", "1");
  const sort = patch.sort ?? f.sort;
  if (sort !== "featured") next.set("sort", sort);
  const prices = patch.prices ?? f.prices;
  if (prices.length) next.set("price", prices.join(","));
  const discounts = patch.discounts ?? f.discounts;
  if (discounts.length) next.set("off", discounts.join(","));
  const base = category ? `/category/${category}` : "/shop";
  const s = next.toString();
  return `${base}${s ? `?${s}` : ""}`;
}

export async function ShopView({ filters: f, categories, settings, whatsapp }: { filters: ShopFilters; categories: Category[]; settings: StoreSettings; whatsapp: string | null }) {
  const products = await listProducts({
    q: f.q, category: f.category?.slug, seasonal: f.seasonal, inStockOnly: f.inStock, sort: f.sort, prices: f.prices, discounts: f.discounts,
  });
  const title = f.q ? `Results for “${f.q}”` : f.seasonal ? "In season now" : f.category?.name ?? "All products";
  const description = f.q ? null : f.seasonal ? "Fruits and vegetables that are in season right now." : f.category?.description ?? "Everything fresh in stock today.";
  const total = categories.reduce((s, c) => s + (c.productCount ?? 0), 0);

  const togglePrice = (key: string) => (f.prices.includes(key) ? f.prices.filter((p) => p !== key) : [...f.prices, key]);
  const toggleOff = (key: string) => (f.discounts.includes(key) ? f.discounts.filter((p) => p !== key) : [...f.discounts, key]);

  const chip = (label: string, link: string, on: boolean) => (
    <Link
      key={label}
      href={link}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        on ? "border-forest-800 bg-forest-800 text-white" : "border-line bg-white text-ink-soft hover:border-forest-700/30",
      )}
    >
      {on ? <Check className="size-3.5" aria-hidden /> : null}
      {label}
    </Link>
  );

  const checkboxLink = (label: string, on: boolean, link: string) => (
    <Link href={link} scroll={false} role="checkbox" aria-checked={on} className="flex items-center gap-3 rounded-lg px-2 py-2 text-[0.9375rem] text-ink-soft hover:bg-sage-50">
      <span className={cn("grid size-[1.15rem] shrink-0 place-items-center rounded border-2", on ? "border-forest-800 bg-forest-800 text-white" : "border-sage-200 bg-white")}>
        {on ? <Check className="size-3" aria-hidden /> : null}
      </span>
      {label}
    </Link>
  );
  const discountLinks = DISCOUNT_BUCKETS.map((b) => <div key={b.key}>{checkboxLink(b.label, f.discounts.includes(b.key), hrefFor(f, { discounts: toggleOff(b.key) }))}</div>);

  return (
    <>
      <PageBanner
        title={<>Fresh Vegetables<span className="block text-[0.72em] font-semibold text-forest-900">Delivered to your home</span></>}
        subtitle={<span className="font-medium">{storeConfig.serviceArea}</span>}
        image="/images/site/banner-market.webp"
        script={storeConfig.secondaryTagline}
        as="h2" // the listing title below ("All products" / category name) is the page's one h1
      />

      <div className="container-page pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 [&_a]:-my-2.5 [&_a]:py-2.5 text-sm text-ink-soft">
            <Link href="/" className="inline-flex items-center gap-1.5 hover:text-forest-800"><Home className="size-4 text-forest-800" aria-hidden /> Home</Link>
            <ChevronRight className="size-3.5" aria-hidden />
            {f.category ? (
              <>
                <Link href="/shop" className="hover:text-forest-800">Shop</Link>
                <ChevronRight className="size-3.5" aria-hidden />
                <span className="text-ink" aria-current="page">{f.category.name}</span>
              </>
            ) : (
              <span className="text-ink" aria-current="page">Shop</span>
            )}
          </nav>
          <Suspense>
            <SortSelect value={f.sort} />
          </Suspense>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_15.5rem]">
          <aside aria-label="Filters" className="min-w-0 lg:sticky lg:top-32 lg:self-start">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
              {chip("All", hrefFor(f, { category: null, seasonal: false }), !f.category && !f.seasonal)}
              {categories.map((c) => chip(c.name, hrefFor(f, { category: c.slug, seasonal: false }), f.category?.id === c.id))}
              {chip("In season", hrefFor(f, { seasonal: !f.seasonal, category: null }), f.seasonal)}
              {chip("In stock", hrefFor(f, { inStock: !f.inStock }), f.inStock)}
            </div>
            <details className="mt-2 rounded-xl border border-line bg-white lg:hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-forest-800">Price range{f.prices.length ? ` (${f.prices.length})` : ""}</summary>
              <div className="px-2 pb-2">
                {PRICE_BUCKETS.map((b) => <div key={b.key}>{checkboxLink(b.label, f.prices.includes(b.key), hrefFor(f, { prices: togglePrice(b.key) }))}</div>)}
              </div>
            </details>
            <details className="mt-2 rounded-xl border border-line bg-white lg:hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-forest-800">Discount{f.discounts.length ? ` (${f.discounts.length})` : ""}</summary>
              <div className="px-2 pb-2">{discountLinks}</div>
            </details>

            <div className="hidden rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] lg:block">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-forest-800"><Leaf className="size-5" aria-hidden /> Categories</h2>
              <ul className="mt-3 space-y-1">
                {[{ id: "all", slug: null as string | null, name: "All products", productCount: total }, ...categories].map((c) => {
                  const on = c.slug === null ? !f.category && !f.seasonal : f.category?.slug === c.slug;
                  return (
                    <li key={c.id}>
                      <Link
                        href={hrefFor(f, { category: c.slug, seasonal: false })}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[0.9375rem]", on ? "bg-lime-100 font-semibold text-forest-800" : "text-ink-soft hover:bg-sage-50")}
                      >
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", on ? "bg-forest-800 text-white" : "border border-sage-200 text-forest-800")}>{categoryIcon(c.slug, "size-4")}</span>
                        <span className="flex-1">{c.name}</span>
                        <span className="text-xs text-muted">({c.productCount ?? 0})</span>
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link href={hrefFor(f, { seasonal: !f.seasonal, category: null })} scroll={false} aria-current={f.seasonal ? "true" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[0.9375rem]", f.seasonal ? "bg-lime-100 font-semibold text-forest-800" : "text-ink-soft hover:bg-sage-50")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", f.seasonal ? "bg-forest-800 text-white" : "border border-sage-200 text-forest-800")}><Sprout className="size-4" aria-hidden /></span>
                    In season now
                  </Link>
                </li>
              </ul>
              <hr className="my-4 border-line" />
              <h2 className="text-base font-semibold text-forest-800">Price range</h2>
              <div className="mt-2">
                {PRICE_BUCKETS.map((b) => <div key={b.key}>{checkboxLink(b.label, f.prices.includes(b.key), hrefFor(f, { prices: togglePrice(b.key) }))}</div>)}
              </div>
              <hr className="my-4 border-line" />
              <h2 className="text-base font-semibold text-forest-800">Discount</h2>
              <div className="mt-2">{discountLinks}</div>
              <hr className="my-4 border-line" />
              <h2 className="text-base font-semibold text-forest-800">Availability</h2>
              <div className="mt-2">{checkboxLink("In stock only", f.inStock, hrefFor(f, { inStock: !f.inStock }))}</div>
              {f.prices.length || f.discounts.length || f.inStock || f.seasonal || f.q ? (
                <Link href={f.category ? `/category/${f.category.slug}` : "/shop"} className="mt-3 inline-block text-sm font-semibold text-forest-800 underline-offset-4 hover:underline">Clear filters</Link>
              ) : null}
            </div>
          </aside>

          <section aria-labelledby="listing-title" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden size-12 shrink-0 place-items-center rounded-full bg-lime-100 text-forest-800 sm:grid">{f.seasonal ? <Sprout className="size-6" aria-hidden /> : categoryIcon(f.category?.slug, "size-6")}</span>
                <div className="min-w-0">
                  <h1 id="listing-title" className="text-[1.6rem] font-bold leading-tight text-forest-800 sm:text-[2rem]">{title}</h1>
                  {description ? <p className="mt-0.5 text-[0.9375rem] text-muted">{description}</p> : null}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-3 py-1.5 text-sm font-semibold text-white" aria-live="polite">
                <Leaf className="size-4" aria-hidden /> {products.length} {products.length === 1 ? "item" : "items"}
              </span>
            </div>

            {products.length === 0 ? (
              <EmptyState icon={<SearchX className="size-7" />} title="No products found" action={<ButtonLink href="/shop" variant="dark">See all products</ButtonLink>}>
                {f.q ? <>We couldn&apos;t find anything matching “{f.q}”. Try a different spelling, e.g. “palak” or “spinach”.</> : "Nothing matches these filters right now. Try removing a filter."}
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-4">
                {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
              </div>
            )}
          </section>

          <aside aria-label="Why shop with us" className="hidden space-y-4 xl:block">
            <div className="rounded-[var(--radius-card)] border border-line bg-gradient-to-b from-lime-50 to-white p-5 shadow-[var(--shadow-card)]">
              <p className="text-lg font-semibold leading-tight text-forest-800">Freshness you can count on</p>
              <ul className="mt-4 space-y-3.5 text-sm text-ink-soft">
                <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-forest-800 text-white"><Leaf className="size-4" aria-hidden /></span>Live stock &amp; prices</li>
                <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-forest-800 text-white"><Truck className="size-4" aria-hidden /></span>Delivery in {storeConfig.serviceArea}</li>
                {settings.codEnabled ? <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-forest-800 text-white"><Banknote className="size-4" aria-hidden /></span>Cash on delivery</li> : null}
                <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-forest-800 text-white"><ShieldCheck className="size-4" aria-hidden /></span>Prices shown are per pack</li>
              </ul>
            </div>
            {whatsapp ? (
              <div className="overflow-hidden rounded-[var(--radius-card)] bg-forest-800 p-5 text-white">
                <p className="font-script text-[2rem] font-bold leading-[0.95]">Eat Fresh,<br />Stay Healthy</p>
                <p className="mt-2 text-sm text-white/80">Add items to your cart, choose a delivery slot and order on WhatsApp.</p>
                <Link href="/order" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-forest-800 hover:bg-lime-100">
                  <WhatsAppIcon className="size-4 text-whatsapp-dark" /> Order on WhatsApp
                </Link>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
