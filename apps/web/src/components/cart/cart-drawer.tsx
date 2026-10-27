"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Clock, ShoppingBasket, ShoppingCart, X } from "lucide-react";
import { formatINR, type QuoteIssue } from "@freshbasket/shared";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { FreeDeliveryProgress } from "./order-summary";
import { ProductImage } from "../product/product-image";
import { QuantityStepper } from "../product/quantity-stepper";
import { useNextSlotLabel } from "../layout/next-slot";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { cn } from "../ui/cn";

const BLOCKING: QuoteIssue["code"][] = ["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "EMPTY_CART", "TOO_MANY_LINES", "BELOW_MIN_ORDER"];

/**
 * Header cart: phones go to the cart page; tablets and laptops open the basket as a side drawer
 * (items, bill details and the next step), the way quick-commerce apps do.
 */
export function CartButton({ count, total, whatsappEnabled }: { count: number; total: number; whatsappEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const label = `Cart, ${count} item${count === 1 ? "" : "s"}`;
  // On the cart and checkout pages the basket is already on screen: the button just goes to the cart.
  const drawerAllowed = !/^\/(cart|checkout|order)(\/|$)/.test(pathname);
  const inner = (
    <>
      <ShoppingCart className="size-[1.35rem] shrink-0" aria-hidden />
      {count > 0 ? (
        <span className="hidden flex-col items-start text-left leading-tight md:flex">
          <span className="text-xs font-semibold">{count} item{count === 1 ? "" : "s"}</span>
          <span className="text-sm font-bold tabular-nums">{formatINR(total)}</span>
        </span>
      ) : (
        <span className="hidden text-[0.9375rem] font-bold md:inline">My Cart</span>
      )}
    </>
  );
  const pill = "relative h-11 items-center gap-2 rounded-lg px-2.5 md:h-12 md:min-w-[7.5rem] md:bg-leaf-600 md:px-3.5 md:text-white md:hover:bg-forest-700";
  return (
    <>
      <Link href="/cart" aria-label={label} className={cn(pill, "inline-flex text-forest-800 hover:bg-sage-100", drawerAllowed && "md:hidden")}>
        {inner}
        {count > 0 ? <PhoneBadge count={count} /> : null}
      </Link>
      {drawerAllowed ? (
        <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={cn(pill, "hidden md:inline-flex")}>
          {inner}
        </button>
      ) : null}
      {/* Portal: the sticky header uses backdrop-blur, which would trap a fixed drawer inside the header. */}
      {open ? createPortal(<CartDrawer onClose={() => setOpen(false)} whatsappEnabled={whatsappEnabled} />, document.body) : null}
    </>
  );
}

function PhoneBadge({ count }: { count: number }) {
  return (
    <span className="absolute right-0 top-0.5 grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[0.6875rem] font-bold leading-5 text-white ring-2 ring-white md:hidden">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function CartDrawer({ onClose, whatsappEnabled }: { onClose: () => void; whatsappEnabled: boolean }) {
  const { lines, count, setQuantity, location } = useCart();
  const { data, loading } = useQuote(location?.pincode);
  const slot = useNextSlotLabel();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose, read by the keyboard handler — so the focus setup below runs once per opening
  // (re-running it on every render moved focus back to "Close" whenever the cart changed).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      // Keep Tab inside the drawer while it is open.
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
        const first = f[0], last = f[f.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      before?.focus?.();
    };
  }, []);

  const quote = data?.quote ?? null;
  const priced = new Map(quote?.lines.map((l) => [l.variantId, l]));
  const messages = data?.messages ?? {};
  const blocking = quote?.issues.filter((i) => BLOCKING.includes(i.code)) ?? [];
  const afterDiscount = quote ? quote.subtotal - quote.discount : lines.reduce((s, l) => s + l.quantity * l.priceHint, 0);
  const belowMinimum = Boolean((location && messages._cart) || (!location && quote && data?.minOrder && afterDiscount < data.minOrder));
  const canContinue = Boolean(quote) && blocking.length === 0 && !loading && !belowMinimum;
  const known = Boolean(location && data?.area);
  const grand = quote ? (known ? quote.total : afterDiscount) : afterDiscount;
  const threshold = known ? data?.area?.freeAbove : (data?.area?.freeAbove ?? data?.commonFreeAbove);
  const go = (href: string) => { onClose(); router.push(href); };

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" aria-label="Close cart" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/45" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col bg-sage-50 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3.5">
          <h2 id="drawer-title" className="text-lg font-bold text-ink">My Cart</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close cart" className="grid size-9 place-items-center rounded-full hover:bg-sage-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-lime-100 text-forest-800"><ShoppingBasket className="size-8" aria-hidden /></span>
            <p className="text-lg font-bold text-ink">Your cart is empty</p>
            <p className="text-sm text-muted">Add fresh fruits and vegetables and they&apos;ll appear here.</p>
            <button type="button" onClick={() => go("/shop")} className="mt-2 h-11 rounded-lg bg-leaf-600 px-5 font-semibold text-white hover:bg-forest-700">Start shopping</button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              <section className="rounded-xl bg-white p-3.5">
                <p className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-lime-100 text-forest-800"><Clock className="size-5" aria-hidden /></span>
                  <span className="leading-tight">
                    <span className="block font-bold text-ink">{slot ? `Delivery ${slot}` : "Delivery slot at checkout"}</span>
                    <span className="text-xs text-muted">Shipment of {count} item{count === 1 ? "" : "s"}</span>
                  </span>
                </p>
                <ul className="mt-3 divide-y divide-line">
                  {lines.map((l) => {
                    const p = priced.get(l.variantId);
                    const unit = p?.unitPrice ?? l.priceHint;
                    const msg = messages[l.variantId];
                    return (
                      <li key={l.variantId} className="flex items-center gap-3 py-2.5">
                        <ProductImage src={l.imageUrl} alt={l.productName} sizes="64px" className="size-16 shrink-0 rounded-lg border border-line bg-white" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{l.productName}</p>
                          <p className="text-xs text-muted">{l.variantLabel}</p>
                          <p className="text-sm font-bold tabular-nums text-ink">{formatINR(unit)}</p>
                          {msg ? <p className="text-xs font-medium text-danger" role="alert">{msg}</p> : null}
                        </div>
                        <QuantityStepper
                          size="sm"
                          tone="solid"
                          value={l.quantity}
                          max={p ? Math.max(0, p.maxQuantity) : undefined}
                          onChange={(n) => setQuantity(l.variantId, p ? Math.min(n, Math.max(p.maxQuantity, Math.min(n, l.quantity))) : n)}
                          label={`${l.productName} ${l.variantLabel}`}
                          className="h-8 w-[4.75rem] shrink-0 [&>button]:size-8"
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="bill-title" className="rounded-xl bg-white p-3.5 text-sm" aria-busy={loading}>
                <h3 id="bill-title" className="font-sans text-base font-bold text-ink">Bill details</h3>
                <dl className={cn("mt-2 space-y-1.5", loading && "opacity-60")}>
                  <div className="flex justify-between"><dt className="text-ink-soft">Items total</dt><dd className="tabular-nums">{formatINR(quote?.subtotal ?? afterDiscount)}</dd></div>
                  {quote && quote.discount > 0 ? (
                    <div className="flex justify-between"><dt className="text-ink-soft">Coupon {quote.couponCode}</dt><dd className="tabular-nums text-leaf-600">−{formatINR(quote.discount)}</dd></div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Delivery charge</dt>
                    <dd className="tabular-nums">{quote && known ? (quote.deliveryFee === 0 ? <span className="font-semibold text-leaf-600">FREE</span> : formatINR(quote.deliveryFee)) : <span className="text-muted">Add PIN code at checkout</span>}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Grand total</dt><dd className="tabular-nums">{formatINR(grand)}{known ? "" : " + delivery"}</dd></div>
                </dl>
                {threshold && threshold > 0 ? <FreeDeliveryProgress short={Math.max(0, threshold - afterDiscount)} freeAbove={threshold} className="!mt-3" /> : null}
              </section>

              {messages._cart || (!location && quote && data?.minOrder && afterDiscount < data.minOrder) ? (
                <p className="rounded-xl bg-[#fdf6e7] p-3 text-sm font-medium text-[#7a5212]" role="status">
                  {messages._cart ?? `Minimum order is ${formatINR(data!.minOrder!)}. Add ${formatINR(data!.minOrder! - afterDiscount)} more to check out.`}
                </p>
              ) : null}
              <Link href="/cart" onClick={onClose} className="block rounded-xl bg-white p-3.5 text-sm font-semibold text-forest-800 hover:bg-lime-50">
                Apply coupon &amp; see full cart <ChevronRight className="inline size-4" aria-hidden />
              </Link>
            </div>

            <div className="space-y-2 border-t border-line bg-white p-3">
              {whatsappEnabled ? (
                <button type="button" disabled={!canContinue} onClick={() => go("/order")} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-whatsapp-dark font-semibold text-whatsapp-dark hover:bg-lime-50 disabled:opacity-50">
                  <WhatsAppIcon className="size-5" /> Order on WhatsApp
                </button>
              ) : null}
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => go("/checkout")}
                className="flex h-14 w-full items-center justify-between rounded-lg bg-leaf-600 px-4 text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:bg-sage-200 disabled:text-muted"
              >
                <span className="text-left leading-tight">
                  <span className="block text-base font-bold tabular-nums">{formatINR(grand)}</span>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wide opacity-85">Total</span>
                </span>
                <span className="inline-flex items-center gap-1 text-base font-bold">Proceed to checkout <ChevronRight className="size-5" aria-hidden /></span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
