"use client";

import Link from "next/link";
import { ArrowRight, ShoppingBasket, Trash2, MapPin, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR, type QuoteIssue } from "@freshbasket/shared";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { OrderSummary } from "./order-summary";
import { CouponForm } from "./coupon-form";
import { ProductImage } from "../product/product-image";
import { QuantityStepper } from "../product/quantity-stepper";
import { Button, ButtonLink } from "../ui/button";
import { EmptyState, Notice } from "../ui/feedback";
import { LocationDialog } from "../layout/location-dialog";

const BLOCKING: QuoteIssue["code"][] = ["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "EMPTY_CART", "TOO_MANY_LINES", "BELOW_MIN_ORDER"];

export function CartView() {
  const { lines, hydrated, setQuantity, remove, location, clear } = useCart();
  const { data, error, loading, retry } = useQuote(location?.pincode);
  const [locOpen, setLocOpen] = useState(false);
  const router = useRouter();

  if (!hydrated) {
    return (
      <div className="container-page pt-10" aria-busy="true">
        <div className="skeleton h-12 w-64" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div>
          <div className="skeleton h-72" />
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-12">
        <EmptyState icon={<ShoppingBasket className="size-7" />} title="Your basket is empty" action={<ButtonLink href="/shop">Shop fresh <ArrowRight className="size-4" aria-hidden /></ButtonLink>}>
          Add some vegetables and they&apos;ll appear here.
        </EmptyState>
      </div>
    );
  }

  const quote = data?.quote ?? null;
  const priced = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const messages = data?.messages ?? {};
  const blocking = quote?.issues.filter((i) => BLOCKING.includes(i.code)) ?? [];
  const couponIssue = quote?.issues.find((i) => i.code === "COUPON_INVALID");

  return (
    <div className="container-page pt-6 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[2.2rem] font-semibold text-forest-900 md:text-5xl">Your basket</h1>
        <button type="button" onClick={() => confirm("Remove all items from your basket?") && clear()} className="text-sm font-medium text-muted underline-offset-4 hover:text-danger hover:underline">
          Clear basket
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
        <section aria-label="Basket items">
          {error ? (
            <Notice tone="error" className="mb-4" title="Couldn't update prices">
              {error}{" "}
              <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold underline">
                <RotateCcw className="size-3.5" aria-hidden /> Retry
              </button>
            </Notice>
          ) : null}
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
            {lines.map((l) => {
              const p = priced.get(l.variantId);
              const msg = messages[l.variantId];
              return (
                <li key={l.variantId} className="flex gap-4 p-4 sm:p-5">
                  <Link href={`/product/${l.productSlug}`} className="shrink-0">
                    <ProductImage src={l.imageUrl} alt={l.productName} sizes="96px" className="size-20 rounded-2xl bg-sage-50 sm:size-24" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/product/${l.productSlug}`} className="font-semibold text-ink hover:text-forest-700">{l.productName}</Link>
                      <p className="text-sm text-muted">
                        {l.variantLabel} · <span className="tabular-nums">{formatINR(p?.unitPrice ?? l.priceHint)}</span> each
                      </p>
                      {msg ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{msg}</p> : null}
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <QuantityStepper size="sm" value={l.quantity} onChange={(n) => setQuantity(l.variantId, n)} label={`${l.productName} ${l.variantLabel}`} tone="outline" />
                      <span className="w-20 text-right font-semibold tabular-nums text-ink">{p ? formatINR(p.lineTotal) : "—"}</span>
                      <button type="button" onClick={() => remove(l.variantId)} aria-label={`Remove ${l.productName}`} className="grid size-10 place-items-center rounded-full text-muted hover:bg-danger-bg hover:text-danger">
                        <Trash2 className="size-[1.1rem]" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link href="/shop" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-forest-800 hover:underline">
            ← Continue shopping
          </Link>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-28">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="size-4 shrink-0 text-leaf-600" aria-hidden />
              {location ? <span className="truncate">Delivering to <b>{location.areaName}</b> ({location.pincode})</span> : <span className="text-muted">Add a PIN code to see delivery fees</span>}
            </span>
            <button type="button" onClick={() => setLocOpen(true)} className="shrink-0 font-semibold text-forest-800 hover:underline">
              {location ? "Change" : "Add"}
            </button>
          </div>
          <OrderSummary quote={quote} pincodeKnown={Boolean(location && data?.area)} loading={loading}>
            <div className="space-y-4">
              <CouponForm applied={quote?.couponCode ?? null} error={couponIssue && "reason" in couponIssue ? messages._coupon : undefined} />
              {messages._cart ? <Notice tone="warning">{messages._cart}</Notice> : null}
              <Button
                size="lg"
                variant="dark"
                className="w-full"
                disabled={!quote || blocking.length > 0 || loading}
                onClick={() => router.push("/checkout")}
              >
                Proceed to checkout <ArrowRight className="size-5" aria-hidden />
              </Button>
              {blocking.length > 0 ? <p className="text-center text-xs text-muted">Fix the highlighted items to continue.</p> : null}
            </div>
          </OrderSummary>
        </aside>
      </div>
      <LocationDialog open={locOpen} onClose={() => setLocOpen(false)} />
    </div>
  );
}
