import { ReceiptText, Sprout } from "lucide-react";
import { formatINR, type Quote } from "@freshbasket/shared";
import type { ReactNode } from "react";

/**
 * Totals panel. All numbers come from the server quote (/api/quote).
 * `delivery` — "known": use quote.deliveryFee; "unknown": PIN code not entered yet;
 * "confirm": PIN code not in our delivery list, seller confirms the charge.
 */
export function OrderSummary({
  quote, delivery, freeAbove, loading, children, items, headerAction,
}: {
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
  const afterDiscount = quote ? quote.subtotal - quote.discount : 0;
  const shortOfFree = quote && delivery === "known" && freeAbove != null && quote.deliveryFee > 0 ? freeAbove - afterDiscount : null;
  const count = quote?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;

  return (
    <section aria-labelledby="summary" className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-busy={loading}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="summary" className="flex items-center gap-2.5 text-xl font-bold text-forest-800">
          <ReceiptText className="size-6" aria-hidden /> Order Summary
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
          <div className="!mt-4 flex items-center justify-between gap-4 rounded-xl bg-lime-100 px-4 py-3">
            <dt className="text-base font-bold text-ink">Total amount</dt>
            <dd className="text-2xl font-bold tabular-nums text-forest-800">
              {formatINR(delivery === "known" ? quote.total : afterDiscount)}
              {delivery !== "known" ? <span className="block text-right text-xs font-medium text-muted">+ delivery</span> : null}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-4 space-y-3" aria-hidden>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}
      {shortOfFree !== null && shortOfFree > 0 ? (
        <p className="mt-4 flex items-start gap-3 rounded-xl border border-lime-200 bg-lime-50 p-3 text-sm text-forest-800">
          <Sprout className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <b>Free delivery above {formatINR(freeAbove!)}</b> in your area. Add {formatINR(shortOfFree)} more to get it.
          </span>
        </p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
