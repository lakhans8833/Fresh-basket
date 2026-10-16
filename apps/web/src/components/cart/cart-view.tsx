"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Pencil, Phone, RotateCcw, ShoppingBasket, ShoppingCart, Trash2, Truck } from "lucide-react";
import { formatINR, type QuoteIssue, type WhatsAppCustomerInput } from "@freshbasket/shared";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { OrderSummary } from "./order-summary";
import { CouponForm } from "./coupon-form";
import { loadSavedCustomer } from "./saved-customer";
import { ProductImage } from "../product/product-image";
import { QuantityStepper } from "../product/quantity-stepper";
import { Button, ButtonLink } from "../ui/button";
import { EmptyState, Notice } from "../ui/feedback";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { LocationDialog } from "../layout/location-dialog";

const BLOCKING: QuoteIssue["code"][] = ["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "EMPTY_CART", "TOO_MANY_LINES", "BELOW_MIN_ORDER"];

export function CartView({ whatsappEnabled }: { whatsappEnabled: boolean }) {
  const { lines, count, hydrated, setQuantity, remove, location, clear } = useCart();
  const { data, error, loading, retry } = useQuote(location?.pincode);
  const [locOpen, setLocOpen] = useState(false);
  const [saved, setSaved] = useState<Partial<WhatsAppCustomerInput> | null>(null);
  const router = useRouter();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- device-local details, read after mount
  useEffect(() => setSaved(loadSavedCustomer()), []);

  if (!hydrated) {
    return (
      <div className="container-page pt-8" aria-busy="true">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24" />)}</div>
          <div className="skeleton h-80" />
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<ShoppingBasket className="size-7" />} title="Your cart is empty" action={<ButtonLink href="/shop">Start shopping</ButtonLink>}>
          Add fresh fruits and vegetables and they&apos;ll appear here.
        </EmptyState>
      </div>
    );
  }

  const quote = data?.quote ?? null;
  const priced = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const messages = data?.messages ?? {};
  const blocking = quote?.issues.filter((i) => BLOCKING.includes(i.code)) ?? [];
  const canContinue = Boolean(quote) && blocking.length === 0 && !loading;

  return (
    <div className="container-page pt-6 md:pt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_27rem]">
        <section aria-labelledby="cart-items" className="min-w-0 rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
            <h2 id="cart-items" className="flex items-center gap-2.5 text-xl font-bold text-ink">
              <ShoppingBasket className="size-6 text-forest-800" aria-hidden /> Cart Items ({count})
            </h2>
            <button type="button" onClick={() => confirm("Remove all items from your cart?") && clear()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-danger hover:bg-danger-bg">
              <Trash2 className="size-4" aria-hidden /> Clear Cart
            </button>
          </div>
          {error ? (
            <Notice tone="error" className="m-4" title="Couldn't update prices">
              {error}{" "}
              <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold underline">
                <RotateCcw className="size-3.5" aria-hidden /> Retry
              </button>
            </Notice>
          ) : null}
          <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_5.5rem_3rem] gap-3 border-b border-line bg-sage-50 px-6 py-2.5 text-sm font-semibold text-ink md:grid">
            <span>Product</span><span>Price</span><span className="text-center">Quantity</span><span className="text-right">Total</span><span className="sr-only">Action</span>
          </div>
          <ul className="divide-y divide-line">
            {lines.map((l) => {
              const p = priced.get(l.variantId);
              const msg = messages[l.variantId];
              const unit = p?.unitPrice ?? l.priceHint;
              const href = l.productSlug ? `/product/${l.productSlug}` : "/shop";
              const msgEl = msg ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{msg}</p> : null;
              // The server quote says how many of this pack fit (weight products: after the other sizes in the cart).
              const stepper = <QuantityStepper size="sm" tone="outline" value={l.quantity} max={p ? Math.max(0, p.maxQuantity) : undefined} onChange={(n) => setQuantity(l.variantId, p ? Math.min(n, Math.max(p.maxQuantity, Math.min(n, l.quantity))) : n)} label={`${l.productName} ${l.variantLabel}`} className="rounded-lg" />;
              const removeBtn = (
                <button type="button" onClick={() => remove(l.variantId)} aria-label={`Remove ${l.productName}`} className="grid size-9 shrink-0 place-items-center rounded-full text-danger hover:bg-danger-bg">
                  <Trash2 className="size-[1.15rem]" />
                </button>
              );
              return (
                <li key={l.variantId} className="px-4 py-4 sm:px-6">
                  {/* phone layout */}
                  <div className="flex gap-3 md:hidden">
                    <Link href={href} className="shrink-0">
                      <ProductImage src={l.imageUrl} alt={l.productName} sizes="72px" className="size-[4.5rem] rounded-xl border border-line bg-white" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={href} className="font-semibold text-ink hover:text-forest-800">{l.productName}</Link>
                          <p className="text-sm text-muted"><span className="font-semibold text-ink-soft tabular-nums">{formatINR(unit)}</span> / {l.variantLabel}</p>
                        </div>
                        {removeBtn}
                      </div>
                      {msgEl}
                      <div className="mt-2 flex items-center justify-between gap-3">
                        {stepper}
                        <span className="font-bold tabular-nums text-ink">{formatINR(p ? p.lineTotal : unit * l.quantity)}</span>
                      </div>
                    </div>
                  </div>
                  {/* tablet / desktop table row */}
                  <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_5.5rem_3rem] items-center gap-3 md:grid">
                    <div className="flex min-w-0 items-center gap-4">
                      <Link href={href} className="shrink-0">
                        <ProductImage src={l.imageUrl} alt={l.productName} sizes="80px" className="size-20 rounded-xl border border-line bg-white" />
                      </Link>
                      <div className="min-w-0">
                        <Link href={href} className="font-semibold text-ink hover:text-forest-800">{l.productName}</Link>
                        <p className="text-sm text-muted">({l.variantLabel})</p>
                        {msgEl}
                      </div>
                    </div>
                    <p className="text-ink"><span className="font-semibold tabular-nums">{formatINR(unit)}</span> <span className="text-xs text-muted">/{l.variantLabel}</span></p>
                    <div className="flex justify-center">{stepper}</div>
                    <span className="text-right font-bold tabular-nums text-ink">{formatINR(p ? p.lineTotal : unit * l.quantity)}</span>
                    <div className="flex justify-center">{removeBtn}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-4 py-4 sm:px-6">
            <Link href="/shop" className="inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-forest-800 hover:underline">
              <ArrowLeft className="size-4" aria-hidden /> Continue Shopping
            </Link>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-32">
          <OrderSummary
            quote={quote}
            delivery={location && data?.area ? "known" : "unknown"}
            freeAbove={data?.area?.freeAbove}
            freeAboveFallback={data?.commonFreeAbove}
            localLines={lines.map((l) => ({ quantity: l.quantity, unitPrice: priced.get(l.variantId)?.unitPrice ?? l.priceHint }))}
            loading={loading}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Truck className="size-4 shrink-0 text-forest-800" aria-hidden />
                  {location ? <span className="truncate">Delivering to <b>{location.areaName}</b> ({location.pincode})</span> : <span className="text-muted">Add your PIN code to see delivery charges</span>}
                </span>
                <button type="button" onClick={() => setLocOpen(true)} className="shrink-0 font-semibold text-forest-800 hover:underline">
                  {location ? "Change" : "Add"}
                </button>
              </div>
              <CouponForm applied={quote?.couponCode ?? null} error={messages._coupon} />
              {messages._cart && location ? (
                <Notice tone="warning">{messages._cart}</Notice>
              ) : !location && quote && data?.minOrder && quote.subtotal - quote.discount < data.minOrder ? (
                // Before a PIN code is known, the store-wide minimum still applies (areas can only raise it).
                <Notice tone="warning">Minimum order is {formatINR(data.minOrder)}. Add {formatINR(data.minOrder - (quote.subtotal - quote.discount))} more to check out.</Notice>
              ) : data?.minOrder ? (
                <p className="text-xs text-muted">Minimum order {formatINR(data.minOrder)}{location ? ` for ${location.areaName}` : ""}.</p>
              ) : null}
              {whatsappEnabled ? (
                <>
                  <Button size="lg" className="w-full rounded-xl text-lg" disabled={!canContinue} onClick={() => router.push("/order")}>
                    <WhatsAppIcon className="size-6" /> Order on WhatsApp
                  </Button>
                  <p className="-mt-2 text-center text-xs text-muted">Send your order details to us on WhatsApp</p>
                  <Button variant="outline" size="lg" className="w-full rounded-xl border-forest-800 text-forest-800" disabled={!canContinue} onClick={() => router.push("/checkout")}>
                    <ShoppingCart className="size-5" aria-hidden /> Proceed to Checkout
                  </Button>
                </>
              ) : (
                <Button size="lg" className="w-full rounded-xl" disabled={!canContinue} onClick={() => router.push("/checkout")}>
                  <ShoppingCart className="size-5" aria-hidden /> Proceed to Checkout
                </Button>
              )}
              {blocking.length > 0 ? <p className="text-center text-xs text-danger">Fix the highlighted items to continue.</p> : null}
            </div>
          </OrderSummary>

          {whatsappEnabled && saved?.name && saved.address ? (
            <section aria-labelledby="saved-address" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <h2 id="saved-address" className="flex items-center gap-2 font-sans text-base font-semibold text-ink"><MapPin className="size-5 text-forest-800" aria-hidden /> Delivery Address</h2>
                <Link href="/order" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-800 hover:underline"><Pencil className="size-3.5" aria-hidden /> Edit</Link>
              </div>
              <div className="mt-3 rounded-xl border border-line bg-sage-50/60 p-3.5 text-sm leading-relaxed text-ink-soft">
                <p className="font-semibold text-ink">{saved.name}</p>
                <p>{saved.address}</p>
                <p>{[saved.area, saved.city].filter(Boolean).join(", ")} {saved.pincode ? `- ${saved.pincode}` : ""}</p>
                {saved.phone ? <p className="mt-1 flex items-center gap-1.5"><Phone className="size-3.5 text-forest-800" aria-hidden /> +91 {saved.phone}</p> : null}
              </div>
              <p className="mt-2 text-xs text-muted">Saved on this device only.</p>
            </section>
          ) : null}
        </aside>
      </div>
      <LocationDialog open={locOpen} onClose={() => setLocOpen(false)} />
    </div>
  );
}
