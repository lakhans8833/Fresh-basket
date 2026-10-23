"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useId } from "react";
import { ShoppingBasket, Check } from "lucide-react";
import { addablePacks, formatINR, formatWeight, MAX_QTY_PER_LINE, sharesWeightStock, unitPriceLabel, type ProductDetail } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { Button, ButtonLink } from "../ui/button";
import { QuantityStepper } from "./quantity-stepper";
import { cn } from "../ui/cn";
import { defaultVariant } from "./default-variant";
import { DiscountBadge, percentOff } from "../ui/price";
import { WhatsAppIcon } from "../ui/whatsapp-icon";

export function ProductPurchase({ product, whatsappEnabled = false }: { product: ProductDetail; whatsappEnabled?: boolean }) {
  // Unique radio-group names: a second copy of this form (e.g. a page kept in the background) must
  // never share them, or React refuses the click ("Mixing React and non-React radio inputs").
  const rg = useId();
  const router = useRouter();
  const first = defaultVariant(product.variants);
  const [variantId, setVariantId] = useState(first?.id);
  const [qty, setQty] = useState(1);
  const { add, quantityOf, hydrated, setQuantity } = useCart();
  const toast = useToast();
  const variant = product.variants.find((v) => v.id === variantId) ?? first;
  // Phones: once the Add to Cart row has scrolled away (reading the description or reviews), a slim bar
  // above the tab bar keeps the chosen size, its price and the button in reach.
  const buyRow = useRef<HTMLDivElement>(null);
  const [rowGone, setRowGone] = useState(false);
  useEffect(() => {
    const el = buyRow.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setRowGone(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [variant?.id]);
  if (!variant) return <p className="mt-6 text-muted">This product is currently unavailable.</p>;
  const out = variant.stock <= 0;
  const inCart = hydrated ? quantityOf(variant.id) : 0;
  // Weight products: all pack sizes share one total, so sizes already in the cart count too.
  const maxAddable = addablePacks(product, variant.id, (id) => (hydrated ? quantityOf(id) : 0), MAX_QTY_PER_LINE);
  const shared = sharesWeightStock(product.stockGrams, product.variants);
  const otherSizesInCart = shared && hydrated ? product.variants.some((v) => v.id !== variant.id && quantityOf(v.id) > 0) : false;
  const addToCart = () => {
    const n = Math.min(qty, maxAddable); // the cart may have changed since the quantity was picked
    if (n <= 0) return;
    add({ variantId: variant.id, productName: product.name, productSlug: product.slug, variantLabel: variant.label, imageUrl: product.imageUrl, priceHint: variant.price }, n);
    toast(`${n} × ${product.name} (${variant.label}) added to cart`);
    setQty(1);
  };

  return (
    <div className="mt-6">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-4xl font-semibold tabular-nums text-forest-900">{formatINR(variant.price)}</span>
        <span className="text-muted">/ {variant.label}</span>
        {unitPriceLabel(variant.price, variant.label) ? <span className="text-sm font-medium tabular-nums text-ink-soft">· {unitPriceLabel(variant.price, variant.label)}</span> : null}
        {variant.mrp && variant.mrp > variant.price ? <s className="text-muted">MRP {formatINR(variant.mrp)}</s> : null}
        <DiscountBadge price={variant.price} mrp={variant.mrp} className="self-center" />
      </p>
      {variant.mrp && variant.mrp > variant.price ? (
        <p className="mt-1 text-sm font-medium text-leaf-600">You save {formatINR(variant.mrp - variant.price)} on this pack</p>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-ink-soft">Choose weight</legend>
        {/* 4 sizes sit in one row (2×2 on phones) instead of 3 + a lonely 4th. */}
        <div className={cn("mt-2.5 grid grid-cols-2 gap-2.5", product.variants.length === 4 ? "sm:grid-cols-4" : product.variants.length === 2 ? "" : "sm:grid-cols-3")}>
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
                <input
                  type="radio"
                  name={`${rg}-variant`}
                  value={v.id}
                  checked={on}
                  onChange={() => { setVariantId(v.id); setQty(1); }}
                  className="sr-only"
                  // Readable name for screen readers / tests ("500 g – ₹32, 20% off"), not the pack's id.
                  aria-label={[
                    `${v.label} – ${formatINR(v.price)}`,
                    percentOff(v.price, v.mrp) ? `${percentOff(v.price, v.mrp)}% off` : null,
                    v.stock <= 0 ? "out of stock" : null,
                  ].filter(Boolean).join(", ")}
                />
                <span className="font-semibold text-ink">{v.label}</span>
                <span className="text-sm font-semibold tabular-nums text-ink">{formatINR(v.price)}</span>
                {v.mrp && v.mrp > v.price ? <s className="text-xs tabular-nums text-muted">{formatINR(v.mrp)}</s> : null}
                {percentOff(v.price, v.mrp) ? <span className="mt-1 rounded bg-lime-200/70 px-1.5 py-px text-[0.6875rem] font-semibold text-forest-800">{percentOff(v.price, v.mrp)}% OFF</span> : null}
                {unitPriceLabel(v.price, v.label) ? <span className="mt-0.5 text-[0.6875rem] tabular-nums text-muted">{unitPriceLabel(v.price, v.label)}</span> : null}
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
        {!out && maxAddable === 0 && otherSizesInCart ? (
          <span className="block text-muted">Other sizes in your cart already use the {formatWeight(product.stockGrams ?? 0)} available.</span>
        ) : null}
      </p>

      <div ref={buyRow} className="mt-5 flex flex-wrap items-center gap-3">
        {!out && maxAddable > 0 ? <QuantityStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} max={maxAddable} label={product.name} tone="outline" /> : null}
        <Button
          variant="dark"
          size="lg"
          className="min-w-56 flex-1 sm:flex-none"
          disabled={out || maxAddable === 0}
          onClick={addToCart}
        >
          <ShoppingBasket className="size-5" aria-hidden /> {out ? "Out of stock" : maxAddable === 0 ? "Maximum in cart" : "Add to Cart"}
        </Button>
        {inCart > 0 ? (
          <ButtonLink href="/cart" variant="outline" size="lg">
            View cart
          </ButtonLink>
        ) : null}
      </div>
      {whatsappEnabled && !out ? (
        <button
          type="button"
          onClick={() => {
            // Makes the cart hold the chosen quantity of this pack (never less than already there), then
            // opens the WhatsApp order form. Before the cart has loaded, just open the form.
            if (!hydrated) return router.push("/order");
            if (inCart > 0) {
              if (qty > inCart) setQuantity(variant.id, Math.min(qty, inCart + maxAddable));
              return router.push("/order");
            }
            const n = Math.min(qty, maxAddable);
            if (n > 0) add({ variantId: variant.id, productName: product.name, productSlug: product.slug, variantLabel: variant.label, imageUrl: product.imageUrl, priceHint: variant.price }, n);
            router.push("/order");
          }}
          className="mt-3 inline-flex h-12 w-full min-w-56 items-center justify-center gap-2 rounded-full bg-whatsapp-dark px-6 font-semibold text-white transition-colors hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200 sm:w-auto"
        >
          <WhatsAppIcon className="size-5" /> Order on WhatsApp
        </button>
      ) : null}
      {rowGone && !out && maxAddable > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_-16px_rgb(11_102_35/0.4)] backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-ink">{product.name} · {variant.label}</span>
              <span className="text-sm tabular-nums text-forest-900">
                {formatINR(variant.price)}
                {inCart > 0 ? <span className="text-muted"> · {inCart} in cart</span> : null}
              </span>
            </p>
            <Button variant="dark" className="shrink-0" onClick={addToCart}>
              <ShoppingBasket className="size-4" aria-hidden /> Add to Cart
            </Button>
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-muted">
        Fresh produce varies in size; you&apos;re charged the listed price for the selected weight. See our{" "}
        <Link href="/returns" className="underline underline-offset-2">returns policy</Link>.
      </p>
    </div>
  );
}
