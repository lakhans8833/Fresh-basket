"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { formatINR, MAX_QTY_PER_LINE, unitPriceLabel, type ProductSummary } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { ProductImage } from "./product-image";
import { FavouriteButton } from "./favourite-button";
import { QuantityStepper } from "./quantity-stepper";
import { cn } from "../ui/cn";
import { bestDealVariant, defaultVariant } from "./default-variant";
import { DiscountBadge, percentOff } from "../ui/price";
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
  const maxAddable = variant ? Math.max(0, Math.min(MAX_QTY_PER_LINE, variant.stock) - inCart) : 0;

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
    const cap = Math.min(MAX_QTY_PER_LINE, variant.stock);
    const next = Math.max(0, Math.min(n, Math.max(cap, 0)));
    setQuantity(variant.id, next);
    if (next === 0) toast(`${product.name} (${variant.label}) removed from cart`);
  }
  const cartCap = variant ? Math.min(MAX_QTY_PER_LINE, Math.max(variant.stock, inCart)) : 0;
  return { variant, setVariantId: choosePack, qty, setQty, inCart, maxAddable, addToCart, justAdded, setCartQty, cartCap };
}

/** Product card: white photo panel, pack size, price per pack, quantity and Add to Cart. */
export function ProductCard({ product, priority, variant: layout = "grid", preferDeal, preferVariantId }: { product: ProductSummary; index?: number; priority?: boolean; variant?: "grid" | "compact"; preferDeal?: boolean; preferVariantId?: string }) {
  const s = useCardState(product, preferDeal, preferVariantId);
  const v = s.variant;
  if (!v) return null;
  const out = v.stock <= 0;
  /** Every size is sold out (not just the one shown). */
  const soldOut = !product.inStock;
  const full = !out && s.maxAddable === 0;
  const href = `/product/${product.slug}`;

  const addButton = (
    <button
      type="button"
      disabled={out || full}
      onClick={s.addToCart}
      className={cn(
        "relative z-10 inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
        out || full ? "bg-sage-100 text-muted" : s.justAdded ? "bg-leaf-600 text-white" : "bg-forest-800 text-white hover:bg-forest-900",
        layout === "grid" ? "w-full" : "min-w-[6.5rem] flex-1 px-2.5",
      )}
      aria-label={out ? `${product.name} is out of stock` : full ? `${product.name}: maximum quantity already in cart` : `Add ${s.qty} × ${product.name} ${v.label} to cart`}
    >
      {out ? "Out of stock" : full ? "Max in cart" : s.justAdded ? <><Check className="size-4" aria-hidden /> Added</> : <><ShoppingCart className="size-4" aria-hidden /> {layout === "grid" ? "Add to Cart" : "Add"}</>}
    </button>
  );

  // Not in the cart yet: pick a quantity, then Add. Already in the cart: the card shows the cart's
  // own quantity and − / + change the cart directly (so it never "jumps back" to 1 after adding).
  const inCartMode = s.inCart > 0;
  const stepper = inCartMode ? (
    <QuantityStepper
      size="sm"
      tone="lime"
      value={s.inCart}
      onChange={s.setCartQty}
      max={s.cartCap}
      label={`${product.name} ${v.label} in cart`}
      className={cn("relative z-10 rounded-lg font-semibold", layout === "grid" ? "w-full" : "shrink-0")}
    />
  ) : !out && !full ? (
    <QuantityStepper
      size="sm"
      tone="outline"
      value={s.qty}
      onChange={(n) => s.setQty(Math.max(1, Math.min(n, s.maxAddable)))}
      max={s.maxAddable}
      label={`${product.name} ${v.label}`}
      className={cn("relative z-10 rounded-lg", layout === "grid" ? "w-full" : "shrink-0")}
    />
  ) : null;
  const inCartNote = inCartMode ? (
    <Link
      href="/cart"
      className={cn(
        "relative z-10 inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-forest-800 px-3 text-sm font-semibold text-forest-800 hover:bg-lime-50",
        layout === "grid" ? "w-full" : "min-w-[6.5rem] flex-1 px-2.5",
      )}
    >
      <Check className="size-4" aria-hidden /> {s.inCart} in cart · View
    </Link>
  ) : null;
  const actions = inCartMode ? <>{stepper}{inCartNote}</> : <>{stepper}{addButton}</>;

  if (layout === "compact") {
    return (
      <article className="group relative flex gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
        <div className="relative shrink-0">
          <ProductImage src={product.imageUrl} alt={product.name} sizes="96px" className={cn("size-20 rounded-xl bg-white sm:size-24", soldOut && "grayscale")} />
          {out ? <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/70 text-[0.6875rem] font-semibold text-danger">Sold out</span> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate font-sans text-[0.9375rem] font-semibold text-ink">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{product.name}</Link>
          </h3>
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted">
            <span className="font-bold tabular-nums text-forest-800">{formatINR(v.price)}</span> / {v.label}
            {v.mrp && v.mrp > v.price ? <s className="text-xs">{formatINR(v.mrp)}</s> : null}
            {percentOff(v.price, v.mrp) ? <span className="text-xs font-semibold text-offer">{percentOff(v.price, v.mrp)}% off</span> : null}
          </p>
          {unitPriceLabel(v.price, v.label) ? <p className="text-xs tabular-nums text-muted">({unitPriceLabel(v.price, v.label)})</p> : null}
          {product.variants.length > 1 ? <PackSizeSelect product={product} value={v.id} onChange={s.setVariantId} className="mt-1.5 max-w-[12rem]" /> : null}
          {out ? <p className="text-xs font-medium text-danger">Out of stock</p> : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">{actions}</div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-[var(--radius-card)] border border-line shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]",
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
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <h3 className="font-sans text-[0.9375rem] font-semibold leading-snug text-ink sm:text-base">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{product.name}</Link>
        </h3>
        <PackSizeSelect product={product} value={v.id} onChange={s.setVariantId} />
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-lg font-bold tabular-nums text-forest-800 sm:text-xl">{formatINR(v.price)}</span>
          {v.mrp && v.mrp > v.price ? <s className="text-xs text-muted">MRP {formatINR(v.mrp)}</s> : null}
        </p>
        {unitPriceLabel(v.price, v.label) ? <p className="-mt-1 text-xs tabular-nums text-muted">({unitPriceLabel(v.price, v.label)})</p> : null}
        <p className="min-h-4 text-xs font-medium" aria-live="polite">
          {out ? <span className="text-danger">Out of stock</span> : v.stock <= 5 ? <span className="text-amber">Only {v.stock} left</span> : null}
        </p>
        <div className="mt-auto flex flex-col gap-2 pt-1">{actions}</div>
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
