import { ReceiptText, Truck } from "lucide-react";
import { formatINR, type Quote } from "@freshbasket/shared";
import type { ReactNode } from "react";

/**
 * Totals panel. Totals come from the server quote (/api/quote). While it loads, the subtotal is shown
 * straight away from the cart's own prices (`localLines`) and only delivery / total wait (skeleton).
 * `delivery` — "known": use quote.deliveryFee; "unknown": PIN code not entered yet;
 * "confirm": PIN code not in our delivery list, seller confirms the charge.
 */
export function OrderSummary({
  quote, delivery, freeAbove, loading, children, items, headerAction, localLines, freeAboveFallback,
}: {
  /** Cart lines with their last known prices — shown instantly before the server quote arrives. */
  localLines?: { quantity: number; unitPrice: number }[];
  /** Free-delivery amount to use when no delivery area is known yet (same for every area). */
  freeAboveFallback?: number | null;
  quote: Quote | null;
  delivery: "known" | "unknown" | "confirm";
  freeAbove?: number | null;
  loading?: boolean;
  children?: ReactNode;
  /** Optional item table rendered between the header and the totals. */
  items?: ReactNode;
  headerAction?: ReactNode;
}) {
  const row = (label: ReactNode, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums font-medium text-ink">{value}</dd>
    </div>
  );
  const localSubtotal = localLines?.reduce((s, l) => s + l.unitPrice * l.quantity, 0) ?? null;
  const afterDiscount = quote ? quote.subtotal - quote.discount : (localSubtotal ?? 0);
  // Free-delivery progress (same rule as the server: subtotal after discount >= free_above). Uses the
  // area's amount, or the one all areas share before a PIN code is chosen; hidden when there is none.
  const threshold = delivery === "known" ? freeAbove : delivery === "unknown" ? (freeAbove ?? freeAboveFallback) : null;
  const hasItems = quote ? quote.lines.length > 0 : (localLines?.length ?? 0) > 0;
  const showFree = Boolean(threshold != null && threshold > 0 && hasItems && (quote || localSubtotal !== null));
  const shortOfFree = showFree ? Math.max(0, threshold! - afterDiscount) : null;
  const count = quote ? quote.lines.reduce((s, l) => s + l.quantity, 0) : (localLines?.reduce((s, l) => s + l.quantity, 0) ?? 0);
  const pending = <span className="skeleton inline-block h-4 w-16 align-middle" aria-hidden />;

  return (
    <section aria-labelledby="summary" className="rounded-xl border border-line bg-white p-4 sm:p-5" aria-busy={loading}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="summary" className="flex items-center gap-2 font-sans text-lg font-bold text-ink">
          <ReceiptText className="size-5 text-forest-800" aria-hidden /> Order Summary
        </h2>
        {headerAction}
      </div>
      {items}
      {quote ? (
        <dl className={`mt-4 space-y-2.5 text-[0.9375rem] transition-opacity ${loading ? "opacity-60" : ""}`}>
          {row(`Subtotal (${count} ${count === 1 ? "item" : "items"})`, formatINR(quote.subtotal))}
          {quote.discount > 0
            ? row(<>Discount <span className="rounded bg-lime-100 px-1.5 py-0.5 text-xs font-semibold text-forest-800">{quote.couponCode}</span></>, <span className="text-leaf-600">−{formatINR(quote.discount)}</span>)
            : null}
          {row(
            "Delivery charges",
            delivery === "known" ? (quote.deliveryFee === 0 ? <span className="text-leaf-600">Free</span> : formatINR(quote.deliveryFee))
              : delivery === "confirm" ? <span className="text-sm font-normal text-amber">Confirmed on WhatsApp</span>
              : <span className="text-sm font-normal text-muted">Add PIN code</span>,
          )}
          <div className="!mt-4 flex items-center justify-between gap-4 rounded-lg bg-lime-50 px-3.5 py-2.5">
            <dt className="text-base font-bold text-ink">Total amount</dt>
            <dd className="text-xl font-bold tabular-nums text-forest-800">
              {formatINR(delivery === "known" ? quote.total : afterDiscount)}
              {delivery !== "known" ? <span className="block text-right text-xs font-medium text-muted">+ delivery</span> : null}
            </dd>
          </div>
        </dl>
      ) : localSubtotal !== null && localLines && localLines.length ? (
        <dl className="mt-4 space-y-2.5 text-[0.9375rem]">
          {row(`Subtotal (${count} ${count === 1 ? "item" : "items"})`, formatINR(localSubtotal))}
          {row("Delivery charges", pending)}
          <div className="!mt-4 flex items-center justify-between gap-4 rounded-xl bg-lime-100 px-4 py-3">
            <dt className="text-base font-bold text-ink">Total amount</dt>
            <dd><span className="skeleton inline-block h-7 w-24 align-middle" aria-hidden /><span className="sr-only">Calculating…</span></dd>
          </div>
        </dl>
      ) : (
        <div className="mt-4 space-y-3" aria-hidden>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}
      {shortOfFree !== null ? <FreeDeliveryProgress short={shortOfFree} freeAbove={threshold!} /> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

/** "Add ₹X more for free delivery" with a progress bar towards the delivery area's threshold. */
export function FreeDeliveryProgress({ short, freeAbove, className }: { short: number; freeAbove: number; className?: string }) {
  const pct = Math.max(4, Math.min(100, Math.round(((freeAbove - short) / freeAbove) * 100)));
  const done = short <= 0;
  return (
    <div className={`mt-4 rounded-xl border border-lime-200 bg-lime-50 p-3 text-sm text-forest-800 ${className ?? ""}`}>
      <p className="flex items-start gap-2.5" aria-live="polite">
        <Truck className="mt-0.5 size-5 shrink-0" aria-hidden />
        {done ? (
          <span><b>Delivery FREE!</b> Your order is above {formatINR(freeAbove)}.</span>
        ) : (
          <span>Add <b>{formatINR(short)}</b> more for <b>FREE delivery</b> (free above {formatINR(freeAbove)}).</span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progress to free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done ? 100 : pct}
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-white"
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${done ? "bg-leaf-600" : "bg-leaf-400"}`} style={{ width: `${done ? 100 : pct}%` }} />
      </div>
    </div>
  );
}
