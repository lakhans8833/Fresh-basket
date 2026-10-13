import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX, Check } from "lucide-react";
import { listCategories, listProducts, type SortKey } from "@/lib/catalog";
import { ProductCard } from "@/components/product/product-card";
import { SortSelect } from "@/components/product/shop-controls";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Shop vegetables" };

const SORTS: SortKey[] = ["featured", "price_asc", "price_desc", "name"];

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const q = one("q")?.slice(0, 60);
  const category = one("category");
  const seasonal = one("seasonal") === "1";
  const inStock = one("inStock") === "1";
  const sortParam = one("sort") as SortKey | undefined;
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : "featured";

  const [categories, products] = await Promise.all([
    listCategories(),
    listProducts({ q, category, seasonal, inStockOnly: inStock, sort }),
  ]);
  const activeCat = categories.find((c) => c.slug === category);
  const title = q ? `Results for “${q}”` : seasonal ? "In season now" : activeCat?.name ?? "All vegetables";

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const base: Record<string, string | undefined> = { q, category, seasonal: seasonal ? "1" : undefined, inStock: inStock ? "1" : undefined, sort: sort === "featured" ? undefined : sort };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return `/shop${s ? `?${s}` : ""}`;
  };

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

  return (
    <div className="container-page pt-6 md:pt-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/" className="hover:text-forest-800">Home</Link> <span aria-hidden>/</span> <span className="text-ink">Shop</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.2rem] font-semibold leading-tight text-forest-900 md:text-5xl">{title}</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {products.length} {products.length === 1 ? "product" : "products"}
          </p>
        </div>
        <Suspense>
          <SortSelect value={sort} />
        </Suspense>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside aria-label="Filters" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
            {chip("All", href({ category: null, seasonal: null }), !category && !seasonal)}
            {categories.map((c) => chip(c.name, href({ category: c.slug, seasonal: null }), category === c.slug))}
            {chip("In season", href({ seasonal: seasonal ? null : "1", category: null }), seasonal)}
            {chip("In stock only", href({ inStock: inStock ? null : "1" }), inStock)}
          </div>
          <div className="hidden space-y-6 rounded-[var(--radius-card)] border border-line bg-white p-5 lg:block">
            <div>
              <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-muted">Category</h2>
              <ul className="mt-3 space-y-1">
                {[{ slug: null as string | null, name: "All vegetables", productCount: undefined as number | undefined }, ...categories].map((c) => {
                  const on = (category ?? null) === c.slug && !seasonal;
                  return (
                    <li key={c.slug ?? "all"}>
                      <Link
                        href={href({ category: c.slug, seasonal: null })}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className={cn("flex items-center justify-between rounded-xl px-3 py-2 text-sm", on ? "bg-lime-100 font-semibold text-forest-900" : "text-ink-soft hover:bg-sage-50")}
                      >
                        {c.name}
                        {c.productCount !== undefined ? <span className="text-xs text-muted">{c.productCount}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-muted">Availability</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {[
                  { label: "In season now", on: seasonal, link: href({ seasonal: seasonal ? null : "1", category: null }) },
                  { label: "In stock only", on: inStock, link: href({ inStock: inStock ? null : "1" }) },
                ].map((f) => (
                  <li key={f.label}>
                    <Link href={f.link} scroll={false} role="checkbox" aria-checked={f.on} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-ink-soft hover:bg-sage-50">
                      <span className={cn("grid size-[1.1rem] place-items-center rounded-md border", f.on ? "border-forest-800 bg-forest-800 text-white" : "border-line bg-white")}>
                        {f.on ? <Check className="size-3" aria-hidden /> : null}
                      </span>
                      {f.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <section aria-label="Products" className="min-w-0">
          {products.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-7" />}
              title="No vegetables found"
              action={<ButtonLink href="/shop" variant="dark">See all vegetables</ButtonLink>}
            >
              {q ? <>We couldn&apos;t find anything matching “{q}”. Try a different spelling or a broader term.</> : "Nothing matches these filters right now. Try removing a filter."}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} priority={i < 3} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
