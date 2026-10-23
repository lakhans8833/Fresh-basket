"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatINR } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { cn } from "../ui/cn";
import { Card, CardHeader } from "./ui";

interface Analytics {
  days: number;
  daily: { date: string; sales: number; orders: number }[];
  totals: { sales: number; orders: number; avgOrder: number; items: number };
  previous: { sales: number; orders: number };
  statuses: { status: string; count: number }[];
  topProducts: { name: string; quantity: number; sales: number }[];
  areas: { pincode: string; name: string; orders: number; sales: number }[];
}

const RANGES = [7, 30, 90] as const;
const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: "To confirm (WhatsApp)",
  placed: "New",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** ₹ in compact form for axis ticks and bar tips: ₹950, ₹1.2K, ₹3.4L. Amounts are in paise. */
function compactINR(paise: number) {
  const r = paise / 100;
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(r >= 1_000_000 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(r >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `₹${Math.round(r)}`;
}
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { ...opts, timeZone: "Asia/Kolkata" });

/** A clean axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above the largest value. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function AnalyticsPanel() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<Analytics>(`/api/admin/analytics?days=${days}`)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [days]);

  const loading = !data || data.days !== days;
  return (
    <Card aria-labelledby="sales-overview">
      <CardHeader
        id="sales-overview"
        title="Sales overview"
        description="Paid orders and cash on delivery, by India-time day. Cancelled orders are left out."
        actions={
          <div role="group" aria-label="Period" className="inline-flex rounded-lg bg-sage-100 p-0.5 text-sm">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={days === r}
                onClick={() => setDays(r)}
                className={cn("rounded-md px-3 py-1.5 font-semibold transition-colors", days === r ? "bg-white text-forest-800 shadow-sm" : "text-ink-soft hover:text-forest-800")}
              >
                {r} days
              </button>
            ))}
          </div>
        }
      />
      {error && !data ? <p className="px-6 py-8 text-sm text-danger">Couldn&apos;t load the charts: {error}</p> : (
        <div className={cn("space-y-6 p-5 transition-opacity sm:p-6", loading && data && "opacity-60")} aria-busy={loading}>
          {!data ? (
            <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}</div><div className="skeleton h-56" /></div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Sales" value={formatINR(data.totals.sales)} now={data.totals.sales} before={data.previous.sales} days={data.days} />
                <Tile label="Orders" value={String(data.totals.orders)} now={data.totals.orders} before={data.previous.orders} days={data.days} />
                <Tile label="Average order" value={formatINR(data.totals.avgOrder)} />
                <Tile label="Packs sold" value={String(data.totals.items)} />
              </dl>
              <SalesColumns daily={data.daily} />
            </>
          )}
        </div>
      )}
      {data ? (
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
          <BarList
            title="Top products"
            empty="No sales in this period yet."
            rows={data.topProducts.map((p) => ({ key: p.name, label: p.name, sub: `${p.quantity} pack${p.quantity === 1 ? "" : "s"}`, value: p.sales, text: compactINR(p.sales) }))}
          />
          <BarList
            title="Orders by status"
            empty="No orders in this period yet."
            rows={data.statuses.map((s) => ({ key: s.status, label: STATUS_LABEL[s.status] ?? s.status, value: s.count, text: String(s.count), muted: s.status === "cancelled" }))}
          />
          <BarList
            title="Top delivery areas"
            empty="No orders in this period yet."
            rows={data.areas.map((a) => ({ key: a.pincode, label: a.name ? `${a.name} · ${a.pincode}` : a.pincode, sub: compactINR(a.sales), value: a.orders, text: `${a.orders} order${a.orders === 1 ? "" : "s"}` }))}
          />
        </div>
      ) : null}
    </Card>
  );
}

function Tile({ label, value, now, before, days }: { label: string; value: string; now?: number; before?: number; days?: number }) {
  let delta: React.ReactNode = null;
  if (now !== undefined && before !== undefined) {
    if (before === 0) delta = <span className="text-muted">{now > 0 ? "New this period" : "—"}</span>;
    else {
      const pct = Math.round(((now - before) / before) * 100);
      const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
      delta = (
        <span className={cn("inline-flex items-center gap-0.5 font-semibold", pct > 0 ? "text-leaf-600" : pct < 0 ? "text-danger" : "text-muted")}>
          <Icon className="size-3.5" aria-hidden />{pct > 0 ? "+" : ""}{pct}%<span className="font-normal text-muted">&nbsp;vs previous {days} days</span>
        </span>
      );
    }
  }
  return (
    <div className="rounded-xl border border-line bg-sage-50/60 p-3.5">
      <dt className="text-[0.8125rem] font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-[1.375rem] font-bold leading-tight tabular-nums text-ink">{value}</dd>
      {delta ? <dd className="mt-1 text-xs">{delta}</dd> : null}
    </div>
  );
}

/** Daily sales as columns (one series → no legend; the card title names it). Hover/focus a day for its figures. */
function SalesColumns({ daily }: { daily: Analytics["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(0, ...daily.map((d) => d.sales)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = daily.length <= 7 ? 1 : daily.length <= 30 ? 5 : 15;
  const peak = daily.reduce((best, d, i) => (d.sales > (daily[best]?.sales ?? -1) ? i : best), 0);
  const total = daily.reduce((s, d) => s + d.sales, 0);

  return (
    <figure>
      <figcaption className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">Sales per day</span>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs font-semibold text-leaf-600 hover:underline" aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </figcaption>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sage-50 text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Day</th><th className="px-3 py-2 text-right font-medium">Orders</th><th className="px-3 py-2 text-right font-medium">Sales</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...daily].reverse().map((d) => (
                <tr key={d.date}><td className="px-3 py-1.5">{dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</td><td className="px-3 py-1.5 text-right tabular-nums">{d.orders}</td><td className="px-3 py-1.5 text-right tabular-nums">{formatINR(d.sales)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
          {/* y-axis: clean ticks, compact rupees */}
          <div className="relative h-56 text-right text-[0.6875rem] tabular-nums text-muted" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0" style={{ bottom: `${(t / max) * 100}%`, transform: "translateY(50%)" }}>{compactINR(t)}</span>
            ))}
          </div>
          <div>
            <div className="relative h-56" onMouseLeave={() => setHover(null)}>
              {ticks.map((t) => (
                <span key={t} aria-hidden className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-sage-200" : "bg-line")} style={{ bottom: `${(t / max) * 100}%` }} />
              ))}
              <ol aria-label={`Sales per day, ${daily.length} days, ${formatINR(total)} in total`} className="absolute inset-0 flex items-end gap-[2px]">
                {daily.map((d, i) => {
                  const h = (d.sales / max) * 100;
                  const on = hover === i;
                  return (
                    <li key={d.date} className="relative flex h-full flex-1 items-end justify-center">
                      <button
                        type="button"
                        onMouseEnter={() => setHover(i)}
                        onFocus={() => setHover(i)}
                        onBlur={() => setHover(null)}
                        aria-label={`${dayLabel(d.date, { weekday: "long", day: "numeric", month: "long" })}: ${formatINR(d.sales)}, ${d.orders} order${d.orders === 1 ? "" : "s"}`}
                        className="absolute inset-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-0"
                      />
                      <span
                        aria-hidden
                        className={cn("pointer-events-none w-full max-w-6 rounded-t-[4px] transition-colors", on ? "bg-forest-800" : "bg-leaf-600", d.sales === 0 && "bg-transparent")}
                        style={{ height: d.sales > 0 ? `max(${h}%, 2px)` : 0 }}
                      />
                      {/* the best day carries its value; every other day is in the tooltip and the table */}
                      {i === peak && d.sales > 0 && hover === null ? (
                        <span aria-hidden className="pointer-events-none absolute whitespace-nowrap text-[0.6875rem] font-semibold tabular-nums text-ink" style={{ bottom: `calc(${h}% + 4px)` }}>{compactINR(d.sales)}</span>
                      ) : null}
                      {on ? (
                        <span
                          role="tooltip"
                          className={cn(
                            "pointer-events-none absolute z-10 w-max rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-[var(--shadow-lift)]",
                            i < daily.length / 2 ? "left-0" : "right-0",
                          )}
                          style={{ bottom: `calc(${Math.min(h, 80)}% + 8px)` }}
                        >
                          <span className="block font-semibold text-ink">{dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                          <span className="block tabular-nums text-ink-soft">{formatINR(d.sales)} · {d.orders} order{d.orders === 1 ? "" : "s"}</span>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="mt-1.5 flex gap-[2px] text-[0.6875rem] text-muted" aria-hidden>
              {daily.map((d, i) => (
                <span key={d.date} className="relative h-4 flex-1">
                  {i === daily.length - 1 ? (
                    <span className="absolute right-0 whitespace-nowrap">Today</span>
                  ) : i % every === 0 && daily.length - 1 - i >= every * 0.6 ? (
                    // Phones show every other label so dates never run into each other.
                    <span className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap", (i / every) % 2 === 1 && "hidden sm:inline")}>{dayLabel(d.date)}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars, one hue, value at the tip; the longest bar fills the track. */
function BarList({ title, rows, empty }: { title: string; empty: string; rows: { key: string; label: string; sub?: string; value: number; text: string; muted?: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="bg-white p-5 sm:p-6">
      <h3 className="font-sans text-sm font-bold text-ink">{title}</h3>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">{empty}</p> : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="min-w-0 truncate font-medium text-ink" title={r.label}>{r.label}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">{r.text}{r.sub ? <span className="text-muted"> · {r.sub}</span> : null}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-sage-100" aria-hidden>
                <div className={cn("h-full rounded-full", r.muted ? "bg-sage-200" : "bg-leaf-600")} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
