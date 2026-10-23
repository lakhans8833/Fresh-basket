"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
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
      tone="lime"
      value={s.inCart}
      onChange={s.setCartQty}
      max={s.cartCap}
      label={`${product.name} ${v.label} in cart`}
      className={cn("relative z-10 shrink-0 rounded-lg font-semibold", stack ? "w-full @[12.5rem]:w-[6.75rem]" : "w-[5.75rem] sm:w-[6.75rem]")}
    />
  ) : (
    <button
      type="button"
      disabled={out || full}
      onClick={s.addToCart}
      className={cn(
        "relative z-10 inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-bold tracking-wide transition-colors disabled:cursor-not-allowed",
        stack && "w-full @[12.5rem]:w-auto",
        out || full ? "bg-sage-100 text-xs font-semibold tracking-normal text-muted" : s.justAdded ? "bg-leaf-600 text-white" : "border border-forest-800 bg-lime-50 text-forest-800 hover:bg-forest-800 hover:text-white",
      )}
      aria-label={out ? `${product.name} ${v.label} is out of stock` : full ? `${product.name}: maximum quantity already in cart` : `Add ${product.name} ${v.label} to cart`}
    >
      {out ? "Sold out" : full ? "Max" : s.justAdded ? <Check className="size-4" aria-hidden /> : <>ADD <Plus className="size-3.5" strokeWidth={3} aria-hidden /></>}
    </button>
  );
  const price = (
    <p className="leading-tight">
      <span className="whitespace-nowrap text-base font-bold tabular-nums text-forest-800 sm:text-lg">{formatINR(v.price)}</span>
      {/* Always one line tall, so the price and ADD sit at the same height on every card. */}
      <span className="block h-4 truncate text-[0.6875rem] tabular-nums text-muted" title={v.note ?? undefined}>{[perKg, v.note].filter(Boolean).join(" · ")}</span>
    </p>
  );

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
          {v.mrp && v.mrp > v.price ? <s className="mt-1 text-[0.6875rem] text-muted">MRP {formatINR(v.mrp)}</s> : null}
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
        "group relative flex flex-col rounded-[var(--radius-card)] border border-line shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-forest-700 has-[a:focus-visible]:ring-offset-2",
        soldOut ? "bg-sage-50" : "bg-white",
      )}
    >
      <div className="relative overflow-hidden rounded-t-[var(--radius-card)]">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className={cn("aspect-[4/3] w-full bg-white transition-transform duration-500 group-hover:scale-[1.03]", soldOut ? "opacity-50 grayscale" : out && "opacity-60 grayscale-[40%]")}
          sizes="(min-width: 1280px) 18vw, (min-width: 768px) 30vw, 50vw"
          priority={priority}
        />
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold text-white">Out of stock</span>
        ) : null}
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          <DiscountBadge price={v.price} mrp={v.mrp} />
          {product.seasonal ? (
            <span className="rounded-md bg-forest-800 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">In season</span>
          ) : null}
        </div>
        <FavouriteButton productId={product.id} name={product.name} className="absolute right-2.5 top-2.5 z-10 size-8 bg-white shadow" />
      </div>
      <div className="@container flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 font-sans text-sm font-semibold leading-snug text-ink sm:text-[0.9375rem]">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{product.name}</Link>
        </h3>
        {/* Same height whether or not there is a size picker ("1 pc", combos), so rows line up. */}
        <div className="flex h-7 min-w-0 items-center gap-2">
          <PackSizeSelect compact product={product} value={v.id} onChange={s.setVariantId} className="shrink-0" />
          {!out && v.stock <= 5 ? <span className="truncate text-[0.6875rem] font-medium text-amber">Only {v.stock} left</span> : null}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2 @[12.5rem]:flex-row @[12.5rem]:items-end @[12.5rem]:justify-between">
          <div className="min-w-0">
            <s className={cn("block h-4 truncate whitespace-nowrap text-[0.6875rem] tabular-nums text-muted", !(v.mrp && v.mrp > v.price) && "invisible")}>
              {v.mrp && v.mrp > v.price ? `MRP ${formatINR(v.mrp)}` : "MRP"}
            </s>
            {price}
          </div>
          {action(true)}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
      <div className="skeleton aspect-[4/3] rounded-none" />
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
