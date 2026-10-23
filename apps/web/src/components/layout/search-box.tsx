"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, Loader2, Plus, Search, X } from "lucide-react";
import { formatINR, type ProductSummary, addablePacks, MAX_QTY_PER_LINE } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { ProductImage } from "../product/product-image";
import { defaultVariant } from "../product/default-variant";
import { percentOff } from "../ui/price";
import { cn } from "../ui/cn";

type Suggest = { products: ProductSummary[]; matchedName: string | null; term: string };

/** Header search with type-ahead suggestions (understands Hindi names like "tamatar"). */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState(pathname === "/shop" ? params.get("q") ?? "" : "");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggest | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const examples = useSearchExamples(!q);
  const rootRef = useRef<HTMLFormElement>(null);
  // The header renders two search boxes (desktop + phone); each needs its own ids.
  const inputId = useId();
  const listId = useId();
  const term = q.trim();

  // Fetch suggestions (debounced) while the box is open.
  useEffect(() => {
    if (!open || term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (r.ok) {
          setData({ ...((await r.json()) as Omit<Suggest, "term">), term });
          setActive(-1);
        }
      } catch {
        /* aborted or offline: keep the last results */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Close after navigating, and keep the box in step with the URL: "See all products", "Clear
  // filters", back/forward or leaving the shop change ?q=, and the box must show what the results show.
  const [lastPath, setLastPath] = useState(pathname);
  const urlQ = pathname === "/shop" ? params.get("q") ?? "" : "";
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  if (lastUrlQ !== urlQ) {
    setLastUrlQ(urlQ);
    setQ(urlQ);
    setData(null);
  }

  /** ✕: empty the box — and on a search results page, show all products again. */
  function clearSearch() {
    setQ("");
    setData(null);
    setActive(-1);
    if (pathname === "/shop" && params.get("q")) {
      const next = new URLSearchParams(params.toString());
      next.delete("q");
      next.delete("page");
      router.push(next.toString() ? `/shop?${next}` : "/shop");
    }
  }

  // Only show (and allow Enter / Add on) suggestions that belong to what's typed now — never older ones.
  const fresh = data !== null && data.term === term;
  const products = term.length >= 2 && fresh ? data.products : [];
  const showPanel = open && term.length >= 2 && (data !== null || loading);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && products[active]) {
      router.push(`/product/${products[active]!.slug}`);
    } else {
      router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
    }
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!showPanel) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(products.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  }

  return (
    <form ref={rootRef} role="search" onSubmit={submit} className="relative">
      <label htmlFor={inputId} className="sr-only">
        Search fruits and vegetables
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={examples ? `Search "${examples}"` : "Search fruits & vegetables…"}
        className="h-11 w-full rounded-xl border border-line bg-sage-50 pl-5 pr-20 text-[0.9375rem] text-ink placeholder:text-muted/80 focus:border-leaf-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-lime-200/70 md:h-12"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
      />
      {q ? (
        <button type="button" aria-label="Clear search" onClick={clearSearch} className="absolute right-11 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sage-100">
          <X className="size-4" />
        </button>
      ) : null}
      <button type="submit" aria-label="Search" className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-forest-800 hover:bg-lime-100">
        <Search className="size-[1.2rem]" />
      </button>

      {showPanel ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-lift)]">
          <p className="flex items-center gap-2 border-b border-line bg-sage-50/70 px-4 py-2 text-xs text-muted">
            {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            <span>
              Showing results for “{term}”
              {fresh && data?.matchedName ? <> · <span className="font-medium capitalize text-ink-soft">{data.matchedName}</span></> : null}
            </span>
          </p>
          <ul id={listId} role="listbox" aria-label="Suggestions" className="max-h-[22rem] overflow-y-auto">
            {products.map((p, i) => (
              <SuggestionRow key={p.id} id={`${listId}-${i}`} product={p} active={i === active} onHover={() => setActive(i)} />
            ))}
          </ul>
          {!loading && fresh && products.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">No matches yet. Try another name, e.g. “palak”, “aloo” or “bhindi”.</p>
          ) : null}
          <Link href={`/shop?q=${encodeURIComponent(term)}`} className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-sm font-semibold text-forest-800 hover:bg-lime-50">
            See all results <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </form>
  );
}

function SuggestionRow({ id, product, active, onHover }: { id: string; product: ProductSummary; active: boolean; onHover: () => void }) {
  const { add, quantityOf, hydrated } = useCart();
  const toast = useToast();
  const v = defaultVariant(product.variants);
  if (!v) return null;
  const out = v.stock <= 0;
  const pct = percentOff(v.price, v.mrp);
  // Weight products: other sizes already in the cart use the same stock; also respects the per-line cap.
  const full = hydrated && addablePacks(product, v.id, quantityOf, MAX_QTY_PER_LINE) <= 0;

  return (
    <li id={id} role="option" aria-selected={active} onPointerEnter={onHover} className={cn("relative flex items-center gap-3 px-4 py-2.5", active && "bg-lime-50")}>
      <ProductImage src={product.imageUrl} alt="" sizes="48px" className="size-12 shrink-0 rounded-lg border border-line bg-white" />
      <div className="min-w-0 flex-1">
        <Link href={`/product/${product.slug}`} className="block truncate font-semibold text-ink after:absolute after:inset-0 after:content-['']">
          {product.name}
        </Link>
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted">
          <span className="font-bold tabular-nums text-forest-800">{formatINR(v.price)}</span> / {v.label}
          {pct ? <span className="text-xs font-semibold text-offer">{pct}% off</span> : null}
        </p>
      </div>
      {out ? (
        <span className="relative z-10 shrink-0 text-xs font-medium text-danger">Sold out</span>
      ) : (
        <button
          type="button"
          disabled={full}
          onClick={() => {
            add({ variantId: v.id, productName: product.name, productSlug: product.slug, variantLabel: v.label, imageUrl: product.imageUrl, priceHint: v.price }, 1);
            toast(`${product.name} (${v.label}) added to cart`);
          }}
          aria-label={`Add ${product.name} ${v.label} to cart`}
          className="relative z-10 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-forest-800 px-3 text-sm font-semibold text-forest-800 hover:bg-lime-50 disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden /> Add
        </button>
      )}
    </li>
  );
}

let exampleNames: Promise<string[]> | null = null;
/** Real product names from the catalogue, short form ("Spinach (Palak)" → "palak"). */
function loadExamples() {
  return (exampleNames ??= fetch("/api/products?limit=24")
    .then((r) => (r.ok ? r.json() : { products: [] }))
    .then((d: { products?: { name: string }[] }) => {
      const names = (d.products ?? []).map((p) => {
        const m = /\(([^)]+)\)/.exec(p.name);
        return (m?.[1] ?? p.name).split(/[–-]/)[0]!.trim().toLowerCase();
      });
      return [...new Set(names)].filter((n) => n.length > 1 && n.length < 18).slice(0, 10);
    })
    .catch(() => { exampleNames = null; return []; }));
}

/**
 * Cycles the search placeholder through products we actually sell ("Search \"palak\"") while the box is
 * empty — a hint of what to type, like the big grocery apps. Static when the visitor prefers less motion.
 */
function useSearchExamples(enabled: boolean): string | null {
  const [names, setNames] = useState<string[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    let live = true;
    void loadExamples().then((n) => live && setNames(n));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!enabled || names.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % names.length), 2500);
    return () => clearInterval(t);
  }, [enabled, names.length]);
  return names.length ? names[i % names.length]! : null;
}
