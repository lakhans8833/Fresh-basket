"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { addablePacks, formatINR, MAX_QTY_PER_LINE, unitPriceLabel, type ProductSummary } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { ProductImage } from "./product-image";
import { FavouriteButton } from "./favourite-button";
import { QuantityStepper } from "./quantity-stepper";
import { cn } from "../ui/cn";
import { bestDealVariant, defaultVariant } from "./default-variant";
import { DiscountBadge } from "../ui/price";
import { PackSizeSelect } from "./pack-size-select";

function useCardState(product: ProductSummary, preferDeal = false, preferVariantId?: string) {
  // "Buy again" opens on the pack bought last time (if it's still in stock); Deals open on the
  // pack with the biggest saving so its "% off" matches why it's listed.
  const lastBought = preferVariantId ? product.variants.find((v) => v.id === preferVariantId && v.stock > 0) : undefined;
  const firstAvailable = lastBought ?? (preferDeal ? bestDealVariant(product.variants) : undefined) ?? defaultVariant(product.variants);
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const variant = product.variants.find((v) => v.id === variantId) ?? firstAvailable;
  const { add, quantityOf, hydrated, setQuantity } = useCart();
  const toast = useToast();
  const inCart = variant && hydrated ? quantityOf(variant.id) : 0;
  // Weight products: every pack size in the cart draws from the same total, so count them all.
  const cartQty = (id: string) => (hydrated ? quantityOf(id) : 0);
  const maxAddable = variant ? addablePacks(product, variant.id, cartQty, MAX_QTY_PER_LINE) : 0;

  function addToCart() {
    if (!variant || maxAddable <= 0) return;
    const n = Math.min(qty, maxAddable);
    add({ variantId: variant.id, productName: product.name, productSlug: product.slug, variantLabel: variant.label, imageUrl: product.imageUrl, priceHint: variant.price }, n);
    toast(`${n} × ${product.name} (${variant.label}) added to cart`);
    setQty(1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1600);
  }
  // Changing the pack resets the quantity, so the stepper never shows more than the new pack allows.
  const choosePack = (id: string) => {
    setVariantId(id);
    setQty(1);
  };
  /** Change the quantity already in the cart from the card (0 removes it). */
  function setCartQty(n: number) {
    if (!variant) return;
    const cap = inCart + addablePacks(product, variant.id, cartQty, MAX_QTY_PER_LINE);
    const next = Math.max(0, Math.min(n, Math.max(cap, 0)));
    setQuantity(variant.id, next);
    if (next === 0) toast(`${product.name} (${variant.label}) removed from cart`);
  }
  const cartCap = variant ? Math.max(inCart, inCart + addablePacks(product, variant.id, cartQty, MAX_QTY_PER_LINE)) : 0;
  return { variant, setVariantId: choosePack, qty, setQty, inCart, maxAddable, addToCart, justAdded, setCartQty, cartCap };
}

/** Compact product card: photo, name, size chip (opens a small picker), price (+ per kg) and ADD. */
export function ProductCard({ product, priority, variant: layout = "grid", preferDeal, preferVariantId }: { product: ProductSummary; index?: number; priority?: boolean; variant?: "grid" | "compact"; preferDeal?: boolean; preferVariantId?: string }) {
  const s = useCardState(product, preferDeal, preferVariantId);
  const v = s.variant;
  if (!v) return null;
  const out = v.stock <= 0;
  /** Every size is sold out (not just the one shown). */
  const soldOut = !product.inStock;
  const full = !out && s.maxAddable === 0;
  const href = `/product/${product.slug}`;

  const perKg = unitPriceLabel(v.price, v.label);
  const inCartMode = s.inCart > 0;
  // One tap adds one pack; once it's in the cart the button turns into − N + for the cart itself.
  // `stack`: narrow grid cards put the button on its own full-width row under the price, so the
  // price, MRP and the wider − N + stepper never overlap.
  const action = (stack: boolean) => inCartMode ? (
    <QuantityStepper
      size="sm"
      tone="solid"
      value={s.inCart}
      onChange={s.setCartQty}
      max={s.cartCap}
      label={`${product.name} ${v.label} in cart`}
      className={cn("relative z-10 h-8 shrink-0 font-semibold [&>button]:size-8", stack ? "w-full @[8.25rem]:w-[4.75rem]" : "w-[4.75rem]")}
    />
  ) : (
    <button
      type="button"
      disabled={out || full}
      onClick={s.addToCart}
      className={cn(
        "relative z-10 inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-[0.8125rem] font-bold tracking-wide transition-colors disabled:cursor-not-allowed",
        stack ? "w-full @[8.25rem]:w-[4.75rem]" : "w-[4.75rem]",
        out || full ? "bg-sage-100 text-[0.6875rem] font-semibold tracking-normal text-muted" : s.justAdded ? "bg-leaf-600 text-white" : "border border-leaf-600 bg-lime-50 text-leaf-600 hover:bg-leaf-600 hover:text-white",
      )}
      aria-label={out ? `${product.name} ${v.label} is out of stock` : full ? `${product.name}: maximum quantity already in cart` : `Add ${product.name} ${v.label} to cart`}
    >
      {out ? "Sold out" : full ? "Max" : s.justAdded ? <Check className="size-4" aria-hidden /> : "ADD"}
    </button>
  );
  const price = (
    <p className="min-w-0 leading-tight">
      <span className="block whitespace-nowrap text-[0.875rem] font-bold tabular-nums text-ink sm:text-[0.9375rem]">{formatINR(v.price)}</span>
      {v.mrp && v.mrp > v.price ? <s className="block whitespace-nowrap text-[0.6875rem] tabular-nums text-muted">{formatINR(v.mrp)}</s> : null}
    </p>
  );
  const sub = [perKg, v.note].filter(Boolean).join(" · ");

  if (layout === "compact") {
    return (
      <article className="group relative flex gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-forest-700 has-[a:focus-visible]:ring-offset-2">
        <div className="relative shrink-0">
          <ProductImage src={product.imageUrl} alt={product.name} sizes="96px" className={cn("size-20 rounded-xl bg-white sm:size-24", soldOut && "grayscale")} />
          {out ? <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/70 text-[0.6875rem] font-semibold text-danger">Sold out</span> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate font-sans text-[0.9375rem] font-semibold text-ink">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{product.name}</Link>
          </h3>
          {product.variants.length > 1 ? <PackSizeSelect compact product={product} value={v.id} onChange={s.setVariantId} className="mt-1 self-start" /> : <p className="text-xs text-muted">{v.label}</p>}
          {sub ? <p className="mt-0.5 truncate text-[0.6875rem] tabular-nums text-muted">{sub}</p> : null}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 pt-1.5">
            {price}
            {action(false)}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-xl border border-line p-2 shadow-[0_1px_3px_rgb(20_48_31/0.05)] transition-shadow hover:shadow-[var(--shadow-card)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-forest-700 has-[a:focus-visible]:ring-offset-2 sm:p-2.5",
        soldOut ? "bg-sage-50" : "bg-white",
      )}
    >
      <div className="relative">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className={cn("aspect-square w-full rounded-lg bg-white", soldOut ? "opacity-50 grayscale" : out && "opacity-60 grayscale-[40%]")}
          sizes="(min-width: 1280px) 15vw, (min-width: 768px) 22vw, 45vw"
          priority={priority}
        />
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-ink/80 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-white">Out of stock</span>
        ) : null}
        <DiscountBadge price={v.price} mrp={v.mrp} className="absolute -left-1 top-1.5 rounded-l-none rounded-r-md px-1.5 text-[0.625rem]" />
        {product.seasonal && !soldOut ? (
          <span className="absolute bottom-1 left-1 rounded bg-forest-800/90 px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide text-white">In season</span>
        ) : null}
        <FavouriteButton productId={product.id} name={product.name} className="absolute right-1 top-1 z-10 size-8 bg-white/90 shadow-sm" />
      </div>
      <div className="@container flex flex-1 flex-col pt-1.5">
        <h3 className="line-clamp-2 min-h-[2.5em] font-sans text-[0.8125rem] font-semibold leading-[1.25] text-ink sm:text-sm">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{product.name}</Link>
        </h3>
        {/* Same height whether or not there is a size picker ("1 pc", combos), so rows line up. */}
        <div className="mt-0.5 flex h-7 min-w-0 items-center gap-2">
          <PackSizeSelect compact product={product} value={v.id} onChange={s.setVariantId} className="min-w-0 shrink" />
        </div>
        <p className="h-4 truncate text-[0.6875rem] tabular-nums text-muted" title={sub || undefined}>
          {!out && v.stock <= 5 ? <span className="font-medium text-amber">Only {v.stock} left{sub ? " · " : ""}</span> : null}{sub}
        </p>
        <div className="mt-auto flex flex-col gap-1.5 pt-2 @[8.25rem]:flex-row @[8.25rem]:items-end @[8.25rem]:justify-between">
          {price}
          {action(true)}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-1/4" />
        <div className="skeleton h-6 w-20" />
        <div className="skeleton h-9 w-full rounded-lg" />
        <div className="skeleton h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
