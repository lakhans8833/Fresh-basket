import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
import { Apple, Carrot, Check, ChevronDown, ChevronRight, Home, Leaf, LeafyGreen, SearchX, Sprout } from "lucide-react";
import type { Category, StoreSettings } from "@freshbasket/shared";
import { DISCOUNT_BUCKETS, listProducts, PRICE_BUCKETS, type SortKey } from "@/lib/catalog";
import { ProductCard } from "./product-card";
import { SortSelect } from "./shop-controls";
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

export async function ShopView({ filters: f, categories, whatsapp }: { filters: ShopFilters; categories: Category[]; settings: StoreSettings; whatsapp: string | null }) {
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
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
        on ? "border-leaf-600 bg-lime-50 text-forest-800" : "border-line bg-white text-ink-soft hover:border-forest-700/30",
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
  const dropdown = (label: string, n: number, body: React.ReactNode) => (
    <details className="group relative shrink-0">
      <summary className={cn("flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden", n ? "border-leaf-600 bg-lime-50 text-forest-800" : "border-line bg-white text-ink-soft")}>
        {label}{n ? ` (${n})` : ""} <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {/* On phones the filter row scrolls sideways (overflow-x-auto), which would clip a dropdown under
          the chip — there it opens as a sheet fixed above the bottom bars instead. */}
      <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)] max-sm:fixed max-sm:inset-x-4 max-sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-sm:top-auto max-sm:z-50 max-sm:mt-0 max-sm:w-auto max-sm:p-2">
        <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted sm:hidden">{label}</p>
        {body}
      </div>
    </details>
  );

  const rail = [
    { key: "all", href: hrefFor(f, { category: null, seasonal: false }), name: "All", image: "/images/site/tile-all.webp", on: !f.category && !f.seasonal, count: total },
    ...categories.map((c) => ({ key: c.id, href: hrefFor(f, { category: c.slug, seasonal: false }), name: c.name, image: c.imageUrl, on: f.category?.id === c.id, count: c.productCount ?? 0 })),
    { key: "seasonal", href: hrefFor(f, { seasonal: !f.seasonal, category: null }), name: "In season", image: "/images/site/tile-seasonal.webp", on: f.seasonal, count: null as number | null },
  ];
  const filtered = f.prices.length || f.discounts.length || f.inStock || f.q;

  return (
    <div className="container-page pt-3 md:pt-5">
      <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-[0.8125rem] text-ink-soft sm:flex [&_a]:-my-2.5 [&_a]:py-2.5">
        <Link href="/" className="inline-flex items-center gap-1.5 hover:text-forest-800"><Home className="size-3.5 text-forest-800" aria-hidden /> Home</Link>
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

      <div className="mt-0 grid grid-cols-[4.75rem_minmax(0,1fr)] gap-2.5 sm:mt-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-6">
        {/* Category rail: image + name, the current one marked with a green bar (quick-commerce layout). */}
        <aside aria-label="Categories" className="-ml-4 self-start sm:ml-0 sticky top-[calc(var(--header-h,8rem)+0.5rem)]">
          <ul className="no-scrollbar max-h-[calc(100dvh-var(--header-h,8rem)-5.5rem)] overflow-y-auto border-r border-line bg-white sm:rounded-xl sm:border lg:max-h-[calc(100dvh-var(--header-h,8rem)-2rem)] lg:p-1.5">
            {rail.map((c) => (
              <li key={c.key}>
                <Link
                  href={c.href}
                  scroll={false}
                  aria-current={c.on ? "true" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-1 px-1 py-2.5 text-center lg:flex-row lg:gap-3 lg:rounded-lg lg:px-2 lg:py-2 lg:text-left",
                    "before:absolute before:inset-y-2 before:right-0 before:w-1 before:rounded-l-full lg:before:hidden",
                    c.on ? "bg-lime-50 font-semibold text-forest-800 before:bg-leaf-600" : "text-ink-soft hover:bg-sage-50",
                  )}
                >
                  <span className={cn("relative block size-12 shrink-0 overflow-hidden rounded-xl bg-lime-50 lg:size-11", c.on && "ring-2 ring-leaf-600")}>
                    {c.image ? <Image src={c.image} alt="" fill sizes="48px" className="object-cover" /> : <span className="grid h-full place-items-center text-forest-700">{categoryIcon(c.key, "size-5")}</span>}
                  </span>
                  <span className="line-clamp-2 text-[0.6875rem] leading-tight sm:text-xs lg:flex-1 lg:text-[0.9375rem]">{c.name}</span>
                  {c.count !== null ? <span className="hidden text-xs text-muted lg:inline">{c.count}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section aria-labelledby="listing-title" className="min-w-0 pt-2 sm:pt-0">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <h1 id="listing-title" className="text-lg font-bold leading-tight text-ink sm:text-2xl">{title}</h1>
            <span className="text-[0.8125rem] text-muted" aria-live="polite">{products.length} {products.length === 1 ? "item" : "items"}</span>
          </div>
          {description ? <p className="mt-0.5 hidden text-sm text-muted sm:block">{description}</p> : null}

          <div aria-label="Filters" role="group" className="no-scrollbar -mr-4 mt-3 flex items-center gap-2 overflow-x-auto pb-1 pr-4 sm:mr-0 sm:flex-wrap sm:overflow-visible sm:pr-0">
            <Suspense>
              <SortSelect value={f.sort} />
            </Suspense>
            {chip("In stock", hrefFor(f, { inStock: !f.inStock }), f.inStock)}
            {dropdown("Price", f.prices.length, PRICE_BUCKETS.map((b) => <div key={b.key}>{checkboxLink(b.label, f.prices.includes(b.key), hrefFor(f, { prices: togglePrice(b.key) }))}</div>))}
            {dropdown("Discount", f.discounts.length, DISCOUNT_BUCKETS.map((b) => <div key={b.key}>{checkboxLink(b.label, f.discounts.includes(b.key), hrefFor(f, { discounts: toggleOff(b.key) }))}</div>))}
            {filtered ? (
              <Link href={f.category ? `/category/${f.category.slug}` : "/shop"} className="shrink-0 px-2 text-sm font-semibold text-forest-800 underline-offset-4 hover:underline">Clear filters</Link>
            ) : null}
          </div>

          {products.length === 0 ? (
            <div className="mt-4"><EmptyState icon={<SearchX className="size-7" />} title="No products found" action={<ButtonLink href="/shop" variant="dark">See all products</ButtonLink>}>
              {f.q ? <>We couldn&apos;t find anything matching “{f.q}”. Try a different spelling, e.g. “palak” or “spinach”.</> : "Nothing matches these filters right now. Try removing a filter."}
            </EmptyState></div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5">
              {/* sr-only, so it takes no grid cell; keeps headings in order (h1 → h2 → product h3). */}
              <h2 className="sr-only">Products</h2>
              {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
            </div>
          )}
          {whatsapp ? (
            <Link href="/order" className="mt-6 flex items-center gap-3 rounded-xl bg-forest-800 p-4 text-white hover:bg-forest-900">
              <WhatsAppIcon className="size-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Order on WhatsApp</span>
                <span className="hidden text-sm text-white/80 sm:block">Add items to your cart, choose a delivery slot and send it to us.</span>
              </span>
              <ChevronRight className="size-5 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
