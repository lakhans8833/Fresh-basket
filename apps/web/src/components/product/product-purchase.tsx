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
    <div className="mt-5">
      <div className="border-y border-line py-4">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-display text-[2rem] font-bold leading-none tabular-nums text-ink">{formatINR(variant.price)}</span>
          {variant.mrp && variant.mrp > variant.price ? <s className="text-base text-muted">MRP {formatINR(variant.mrp)}</s> : null}
          <DiscountBadge price={variant.price} mrp={variant.mrp} />
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          <span className="font-medium text-ink">{variant.label}{variant.note ? ` (${variant.note})` : ""}</span>
          {unitPriceLabel(variant.price, variant.label) ? <span className="tabular-nums"> · {unitPriceLabel(variant.price, variant.label)}</span> : null}
          {variant.mrp && variant.mrp > variant.price ? (
            <span className="font-semibold text-leaf-600"> · You save {formatINR(variant.mrp - variant.price)}</span>
          ) : null}
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-base font-bold text-ink">Select unit</legend>
        {/* 4 sizes sit in one row (2×2 on phones) instead of 3 + a lonely 4th. */}
        <div className={cn("mt-2.5 grid grid-cols-2 gap-2.5", product.variants.length === 4 ? "sm:grid-cols-4" : product.variants.length === 2 ? "" : "sm:grid-cols-3")}>
          {product.variants.map((v) => {
            const on = v.id === variant.id;
            return (
              <label
                key={v.id}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border px-3 py-3 text-center transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200",
                  on ? "border-leaf-600 bg-lime-50 ring-1 ring-leaf-600" : "border-line bg-white hover:border-forest-700/30",
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
                <span className="text-[0.9375rem] font-bold text-ink">{v.label}</span>
                <span className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-ink">{formatINR(v.price)}</span>
                  {v.mrp && v.mrp > v.price ? <s className="text-xs tabular-nums text-muted">{formatINR(v.mrp)}</s> : null}
                </span>
                {percentOff(v.price, v.mrp) ? <span className="mt-1 rounded-full bg-offer/10 px-2 py-px text-[0.6875rem] font-bold text-[#9a3412]">{percentOff(v.price, v.mrp)}% off</span> : null}
                {unitPriceLabel(v.price, v.label) ? <span className="mt-0.5 text-[0.6875rem] tabular-nums text-muted">{unitPriceLabel(v.price, v.label)}</span> : null}
                {v.note ? <span className="mt-0.5 text-[0.6875rem] leading-tight text-ink-soft">{v.note}</span> : null}
                {v.stock <= 0 ? <span className="text-[0.6875rem] font-medium text-danger">Out of stock</span> : null}
                {on ? (
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-leaf-600 text-white ring-2 ring-white" aria-hidden>
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : null}
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
          <span className="inline-flex items-center gap-1.5 font-medium text-leaf-600"><span className="size-2 rounded-full bg-leaf-600" aria-hidden />In stock</span>
        )}
        {inCart > 0 ? <span className="text-muted"> · {inCart} already in your cart</span> : null}
        {!out && maxAddable === 0 && otherSizesInCart ? (
          <span className="block text-muted">Other sizes in your cart already use the {formatWeight(product.stockGrams ?? 0)} available.</span>
        ) : null}
      </p>

      <div ref={buyRow} className="mt-4 flex flex-wrap items-center gap-3">
        {!out && maxAddable > 0 ? <QuantityStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} max={maxAddable} label={product.name} tone="outline" /> : null}
        <Button
          variant="dark"
          size="lg"
          className="min-w-48 flex-1"
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
          className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-whatsapp-dark bg-white px-6 font-semibold text-whatsapp-dark transition-colors hover:bg-whatsapp-dark hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200"
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
