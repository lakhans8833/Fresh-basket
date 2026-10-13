"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { formatINR, type ProductSummary } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { ProductImage } from "./product-image";
import { FavouriteButton } from "./favourite-button";
import { QuantityStepper } from "./quantity-stepper";
import { cn } from "../ui/cn";

const TINTS = ["bg-[#fbe3e1]", "bg-[#fde9d6]", "bg-[#e6f1dc]", "bg-[#f7ead3]"];

export function ProductCard({ product, index = 0, priority }: { product: ProductSummary; index?: number; priority?: boolean }) {
  const firstAvailable = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const variant = product.variants.find((v) => v.id === variantId) ?? firstAvailable;
  const { add, quantityOf, setQuantity, hydrated } = useCart();
  const toast = useToast();
  if (!variant) return null;
  const qty = hydrated ? quantityOf(variant.id) : 0;
  const out = variant.stock <= 0;
  const href = `/product/${product.slug}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line/80 bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link href={href} className="block" tabIndex={-1} aria-hidden>
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className={cn("aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.02]", product.imageUrl ? TINTS[index % TINTS.length] : undefined)}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
          priority={priority}
        />
      </Link>
      <FavouriteButton productId={product.id} name={product.name} className="absolute right-3 top-3 z-10" />
      {product.seasonal ? (
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[0.6875rem] font-semibold text-leaf-600 shadow-sm">In season</span>
      ) : null}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-sans text-[0.9875rem] font-semibold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        {product.variants.length > 1 ? (
          <div className="relative z-10 -ml-1 flex flex-wrap gap-1" role="radiogroup" aria-label={`Weight for ${product.name}`}>
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === variant.id}
                onClick={() => setVariantId(v.id)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                  v.id === variant.id ? "bg-forest-800 text-white" : "text-muted hover:bg-sage-100",
                  v.stock <= 0 && "line-through decoration-1",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">{variant.label}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{formatINR(variant.price)}</p>
            {out ? <p className="text-xs font-medium text-danger">Out of stock</p> : variant.stock <= 5 ? <p className="text-xs font-medium text-amber">Only {variant.stock} left</p> : null}
          </div>
          <div className="relative z-10">
            {qty > 0 ? (
              <QuantityStepper size="sm" value={qty} max={Math.min(20, variant.stock)} onChange={(n) => setQuantity(variant.id, n)} label={`${product.name} ${variant.label}`} />
            ) : (
              <button
                type="button"
                disabled={out}
                onClick={() => {
                  add({ variantId: variant.id, productName: product.name, productSlug: product.slug, variantLabel: variant.label, imageUrl: product.imageUrl, priceHint: variant.price });
                  toast(`${product.name} (${variant.label}) added to basket`);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-lime-200 pl-4 pr-3 text-sm font-semibold text-forest-900 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:bg-sage-100 disabled:text-muted"
                aria-label={out ? `${product.name} is out of stock` : `Add ${product.name} ${variant.label} to basket`}
              >
                {out ? "Sold out" : <>Add <Plus className="size-4" aria-hidden /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line/80 bg-white">
      <div className="skeleton aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-1/4" />
        <div className="flex items-end justify-between pt-3">
          <div className="skeleton h-6 w-14" />
          <div className="skeleton h-9 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
