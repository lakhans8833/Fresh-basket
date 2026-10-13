import { formatINR, type Quote } from "@freshbasket/shared";
import type { ReactNode } from "react";

export function OrderSummary({ quote, pincodeKnown, loading, children }: { quote: Quote | null; pincodeKnown: boolean; loading?: boolean; children?: ReactNode }) {
  const row = (label: ReactNode, value: ReactNode, cls = "") => (
    <div className={`flex items-baseline justify-between gap-4 ${cls}`}>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums font-medium text-ink">{value}</dd>
    </div>
  );
  return (
    <section aria-labelledby="summary" className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6" aria-busy={loading}>
      <h2 id="summary" className="text-xl font-semibold text-forest-900">Order summary</h2>
      {quote ? (
        <dl className={`mt-4 space-y-2.5 text-[0.9375rem] transition-opacity ${loading ? "opacity-60" : ""}`}>
          {row(`Items (${quote.lines.reduce((s, l) => s + l.quantity, 0)})`, formatINR(quote.subtotal))}
          {quote.discount > 0 ? row(<>Discount <span className="rounded bg-lime-100 px-1.5 py-0.5 text-xs font-semibold text-forest-800">{quote.couponCode}</span></>, <span className="text-leaf-600">−{formatINR(quote.discount)}</span>) : null}
          {row("Delivery", pincodeKnown ? (quote.deliveryFee === 0 ? <span className="text-leaf-600">Free</span> : formatINR(quote.deliveryFee)) : <span className="text-sm font-normal text-muted">Calculated at checkout</span>)}
          <div className="!mt-4 border-t border-dashed border-line pt-4">
            {row(<span className="text-base font-semibold text-ink">Total</span>, <span className="font-display text-2xl font-semibold text-forest-900">{formatINR(quote.total)}</span>)}
          </div>
        </dl>
      ) : (
        <div className="mt-4 space-y-3" aria-hidden>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-8 w-full" />
        </div>
      )}
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
