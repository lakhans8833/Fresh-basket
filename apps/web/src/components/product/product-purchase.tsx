"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBasket, Check } from "lucide-react";
import { formatINR, MAX_QTY_PER_LINE, type ProductDetail } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { Button, ButtonLink } from "../ui/button";
import { QuantityStepper } from "./quantity-stepper";
import { cn } from "../ui/cn";
import { DiscountBadge } from "../ui/price";

export function ProductPurchase({ product }: { product: ProductDetail }) {
  const first = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(first?.id);
  const [qty, setQty] = useState(1);
  const { add, quantityOf, hydrated } = useCart();
  const toast = useToast();
  const variant = product.variants.find((v) => v.id === variantId) ?? first;
  if (!variant) return <p className="mt-6 text-muted">This product is currently unavailable.</p>;
  const out = variant.stock <= 0;
  const inCart = hydrated ? quantityOf(variant.id) : 0;
  const maxAddable = Math.max(0, Math.min(MAX_QTY_PER_LINE, variant.stock) - inCart);

  return (
    <div className="mt-6">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-4xl font-semibold tabular-nums text-forest-900">{formatINR(variant.price)}</span>
        <span className="text-muted">/ {variant.label}</span>
        {variant.mrp && variant.mrp > variant.price ? <s className="text-muted">MRP {formatINR(variant.mrp)}</s> : null}
        <DiscountBadge price={variant.price} mrp={variant.mrp} className="self-center" />
      </p>
      {variant.mrp && variant.mrp > variant.price ? (
        <p className="mt-1 text-sm font-medium text-leaf-600">You save {formatINR(variant.mrp - variant.price)} on this pack</p>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-ink-soft">Choose weight</legend>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {product.variants.map((v) => {
            const on = v.id === variant.id;
            return (
              <label
                key={v.id}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center rounded-2xl border-2 px-3 py-3 text-center transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200",
                  on ? "border-leaf-500 bg-lime-100" : "border-line bg-white hover:border-forest-700/30",
                  v.stock <= 0 && "opacity-60",
                )}
              >
                <input type="radio" name="variant" value={v.id} checked={on} onChange={() => { setVariantId(v.id); setQty(1); }} className="sr-only" />
                <span className="font-semibold text-ink">{v.label}</span>
                <span className="text-sm tabular-nums text-ink-soft">{formatINR(v.price)}</span>
                {v.stock <= 0 ? <span className="text-[0.6875rem] font-medium text-danger">Out of stock</span> : null}
                {on ? <Check className="absolute right-2 top-2 size-4 text-leaf-600" aria-hidden /> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="mt-4 text-sm" aria-live="polite">
        {out ? (
          <span className="font-medium text-danger">Out of stock — check back soon.</span>
        ) : variant.stock <= 5 ? (
          <span className="font-medium text-amber">Only {variant.stock} left</span>
        ) : (
          <span className="font-medium text-leaf-600">In stock</span>
        )}
        {inCart > 0 ? <span className="text-muted"> · {inCart} already in your cart</span> : null}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!out && maxAddable > 0 ? <QuantityStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} max={maxAddable} label={product.name} tone="outline" /> : null}
        <Button
          variant="dark"
          size="lg"
          className="min-w-56 flex-1 sm:flex-none"
          disabled={out || maxAddable === 0}
          onClick={() => {
            add({ variantId: variant.id, productName: product.name, productSlug: product.slug, variantLabel: variant.label, imageUrl: product.imageUrl, priceHint: variant.price }, qty);
            toast(`${qty} × ${product.name} (${variant.label}) added to cart`);
            setQty(1);
          }}
        >
          <ShoppingBasket className="size-5" aria-hidden /> {out ? "Out of stock" : maxAddable === 0 ? "Maximum in cart" : "Add to Cart"}
        </Button>
        {inCart > 0 ? (
          <ButtonLink href="/cart" variant="outline" size="lg">
            View cart
          </ButtonLink>
        ) : null}
      </div>
      <p className="mt-4 text-xs text-muted">
        Fresh produce varies in size; you&apos;re charged the listed price for the selected weight. See our{" "}
        <Link href="/returns" className="underline underline-offset-2">returns policy</Link>.
      </p>
    </div>
  );
}
