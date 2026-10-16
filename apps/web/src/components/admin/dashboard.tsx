"use client";

import Link from "next/link";
import { AlarmClock, ArrowRight, ClipboardList, IndianRupee, PackageOpen, Truck, Clock, RotateCcw, AlertTriangle, MessageSquare, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { formatINR, formatWeight, type Order } from "@freshbasket/shared";
import { Button } from "../ui/button";
import { EmptyState, Notice } from "../ui/feedback";
import { cn } from "../ui/cn";
import { useAdminData } from "./use-admin-data";
import { Card, CardHeader, LoadError, OrderStatusBadge, PageHeader, PaymentStatusBadge, formatDay, timeAgo } from "./ui";

export interface Stats {
  ordersToday: number;
  revenueToday: number;
  toFulfil: number;
  toConfirm?: number;
  outForDelivery: number;
  awaitingPayment: number;
  refundsPending: number;
  lowStockCount: number;
  lateOrders: number;
  openMessages: number;
  recent: Order[];
  newOrders?: number;
  /** Product-level for weight products (variantId/label null, stockGrams set); per pack otherwise. */
  lowStock: { productId: string; productName: string; variantId: string | null; label: string | null; stock: number | null; stockGrams: number | null; out: boolean }[];
  notificationSetup?: { configured: boolean; allEventsReady: boolean; missing: string[]; events: { event: string; ready: boolean }[] };
  supportGaps?: string[];
  areaMismatches?: { id: string; pincode: string; areaName: string; city: string; pinState: string; storeState: string; serviceArea: string }[];
}

const AUTO_REFRESH_MS = 60_000;

export function Dashboard({ initial }: { initial?: Stats | null }) {
  const { data, error, loading, reload } = useAdminData<Stats>("/api/admin/stats", initial);
  // Keep the alerts current while the dashboard is open and visible (new orders, overdue, stock).
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- stamp when fresh data arrives
  useEffect(() => { if (data) setUpdatedAt(new Date()); }, [data]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") reload(); };
    const t = setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [reload]);

  const alerts = data
    ? [
        (data.newOrders ?? 0) > 0 && { tone: "attention" as const, text: `${data.newOrders} new order${data.newOrders === 1 ? "" : "s"} waiting to be packed`, href: "/admin/orders?status=placed", cta: "Open orders" },
        (data.toConfirm ?? 0) > 0 && { tone: "attention" as const, text: `${data.toConfirm} WhatsApp order${data.toConfirm === 1 ? "" : "s"} to confirm`, href: "/admin/orders?status=pending_confirmation", cta: "Confirm" },
        data.lateOrders > 0 && { tone: "warn" as const, text: `${data.lateOrders} overdue deliver${data.lateOrders === 1 ? "y" : "ies"} — the slot has ended and the order isn't delivered`, href: "/admin/orders?status=late", cta: "See overdue" },
        data.lowStockCount > 0 && { tone: "warn" as const, text: `${data.lowStockCount} product${data.lowStockCount === 1 ? "" : "s"} low or out of stock`, href: "/admin/inventory?filter=low", cta: "Inventory" },
      ].filter(Boolean) as { tone: "attention" | "warn"; text: string; href: string; cta: string }[]
    : [];

  const cards = data
    ? [
        { label: "Orders today", value: data.ordersToday, icon: ClipboardList, href: "/admin/orders" },
        { label: "Revenue today", value: formatINR(data.revenueToday), icon: IndianRupee, hint: "Paid + cash on delivery" },
        { label: "WhatsApp orders to confirm", value: data.toConfirm ?? 0, icon: MessageSquare, href: "/admin/orders?status=pending_confirmation", attention: (data.toConfirm ?? 0) > 0 },
        { label: "To fulfil", value: data.toFulfil, icon: PackageOpen, href: "/admin/orders?status=placed", attention: data.toFulfil > 0 },
        { label: "Overdue deliveries", value: data.lateOrders, icon: AlarmClock, href: "/admin/orders?status=late", warn: data.lateOrders > 0, hint: "Slot over, not delivered yet" },
        { label: "Out for delivery", value: data.outForDelivery, icon: Truck, href: "/admin/orders?status=out_for_delivery" },
        { label: "Awaiting payment", value: data.awaitingPayment, icon: Clock, href: "/admin/orders?status=pending_payment" },
        { label: "Refunds pending", value: data.refundsPending, icon: RotateCcw, href: "/admin/orders?status=cancelled", warn: data.refundsPending > 0 },
        { label: "Low stock", value: data.lowStockCount, icon: AlertTriangle, href: "/admin/inventory?filter=low", warn: data.lowStockCount > 0, hint: "Products (all sizes together)" },
        { label: "Open messages", value: data.openMessages, icon: MessageSquare, href: "/admin/messages", attention: data.openMessages > 0 },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Today at a glance. Figures use India time.${updatedAt ? ` Updated ${updatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · refreshes every minute.` : ""}`}
        actions={
          <Button variant="outline" size="sm" onClick={reload} loading={loading && !!data} aria-label="Refresh dashboard">
            {!(loading && data) ? <RotateCw className="size-4" aria-hidden /> : null} Refresh
          </Button>
        }
      />
      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          {error && data ? (
            <Notice tone="warning" title="Couldn't refresh">
              {error} Showing the figures from {updatedAt?.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) ?? "earlier"}.{" "}
              <button type="button" onClick={reload} className="font-semibold underline">Try again</button>
            </Notice>
          ) : null}
          {data ? (
            alerts.length ? (
              <section aria-label="Needs attention" className="space-y-2">
                {alerts.map((a) => (
                  <Link key={a.href + a.text} href={a.href} className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium", a.tone === "warn" ? "border-danger/30 bg-danger-bg text-danger" : "border-lime-300 bg-lime-50 text-forest-900")}>
                    <span className="flex min-w-0 items-center gap-2"><AlertTriangle className="size-4 shrink-0" aria-hidden /> {a.text}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 font-semibold">{a.cta} <ArrowRight className="size-4" aria-hidden /></span>
                  </Link>
                ))}
              </section>
            ) : (
              <p className="rounded-xl border border-line bg-sage-50 px-4 py-3 text-sm text-ink-soft">Nothing needs attention right now — no new orders waiting, nothing overdue, stock is fine.</p>
            )
          ) : null}
          {data && (data.supportGaps?.length || data.notificationSetup?.allEventsReady === false || data.areaMismatches?.length) ? (
            <section aria-label="Setup" className="space-y-2">
              {data.areaMismatches?.length ? (
                <Notice tone="warning" title="Delivery areas outside your service area">
                  {data.areaMismatches.length} active delivery area{data.areaMismatches.length === 1 ? "" : "s"} ({data.areaMismatches.slice(0, 4).map((a) => `${a.pincode} ${a.city}`).join(", ")}{data.areaMismatches.length > 4 ? ", …" : ""}) {data.areaMismatches.length === 1 ? "is" : "are"} in {[...new Set(data.areaMismatches.map((a) => a.pinState))].join(" / ")}, but the store serves {data.areaMismatches[0]!.serviceArea} ({data.areaMismatches[0]!.storeState}).{" "}
                  Check them in <Link href="/admin/delivery" className="font-semibold underline">Delivery</Link> — nothing has been changed automatically.
                </Notice>
              ) : null}
              {data.supportGaps?.length ? (
                <Notice tone="info" title="Customer support details missing">
                  Not shown to customers until filled in: {data.supportGaps.join(", ")}. Add them in <Link href="/admin/settings" className="font-semibold underline">Settings → Customer support</Link>.
                </Notice>
              ) : null}
              {data.notificationSetup && !data.notificationSetup.allEventsReady ? (
                <Notice tone="info" title={data.notificationSetup.configured ? "Some WhatsApp order updates are off" : "Automatic WhatsApp order updates are off"}>
                  Customers who opt in get updates only for events that are set up. Missing server settings: {data.notificationSetup.missing.map((m) => <code key={m} className="mr-1 rounded bg-white px-1 text-xs">{m}</code>)}
                </Notice>
              ) : null}
            </section>
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {!data
              ? Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-[6.5rem]" />)
              : cards.map((c) => {
                  const Icon = c.icon;
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[0.8125rem] font-medium text-muted">{c.label}</span>
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", c.warn ? "bg-danger-bg text-danger" : c.attention ? "bg-lime-200 text-forest-900" : "bg-sage-100 text-forest-700")}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                      </div>
                      <div className="mt-2 font-display text-[1.75rem] font-semibold leading-none tabular-nums text-forest-900">{c.value}</div>
                      {c.hint ? <div className="mt-1.5 text-xs text-muted">{c.hint}</div> : null}
                    </>
                  );
                  const cls = "block rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-colors";
                  return c.href ? (
                    <Link key={c.label} href={c.href} className={cn(cls, "hover:border-forest-700/30 hover:bg-sage-50/60")}>{body}</Link>
                  ) : (
                    <div key={c.label} className={cls}>{body}</div>
                  );
                })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_22rem] xl:items-start">
            <Card aria-labelledby="recent-orders">
              <CardHeader id="recent-orders" title="Recent orders" actions={<Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-leaf-600 hover:text-forest-800">All orders <ArrowRight className="size-4" aria-hidden /></Link>} />
              {!data ? (
                <div className="space-y-2 p-5"><div className="skeleton h-12" /><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
              ) : data.recent.length === 0 ? (
                <div className="p-5"><EmptyState icon={<ClipboardList className="size-7" aria-hidden />} title="No orders yet">New orders will show up here the moment they&apos;re placed.</EmptyState></div>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orders/${o.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3.5 hover:bg-sage-50 sm:grid-cols-[1fr_auto_auto] sm:px-6">
                        <div className="min-w-0">
                          <p className="font-semibold text-forest-900">{o.orderNumber}</p>
                          <p className="truncate text-sm text-muted">
                            {o.address.fullName} · {o.items.length} item{o.items.length === 1 ? "" : "s"} · {formatDay(o.deliveryDate)}, {o.slotLabel.split(",")[0]}
                          </p>
                        </div>
                        <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                          <OrderStatusBadge status={o.status} />
                          <PaymentStatusBadge status={o.paymentStatus} />
                        </div>
                        <div className="col-start-2 row-start-1 w-24 text-right sm:col-start-3">
                          <p className="font-semibold tabular-nums text-ink">{formatINR(o.total)}</p>
                          <p className="text-xs text-muted">{timeAgo(o.createdAt)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card aria-labelledby="low-stock">
              <CardHeader id="low-stock" title="Low stock" description="Sold by weight: all sizes share one total. Others: 5 or fewer packs left." actions={<Link href="/admin/inventory?filter=low" className="text-sm font-semibold text-leaf-600 hover:text-forest-800">Inventory</Link>} />
              {!data ? (
                <div className="space-y-2 p-5"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
              ) : data.lowStock.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted">Everything is well stocked.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.lowStock.map((v) => (
                    <li key={v.variantId ?? v.productId}>
                      <Link href={`/admin/inventory?q=${encodeURIComponent(v.productName)}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sage-50 sm:px-6">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{v.productName}</span>
                          <span className="text-xs text-muted">{v.label ?? "All sizes (shared stock)"}</span>
                        </span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums", v.out ? "bg-danger-bg text-danger" : "bg-[#fdf6e7] text-[#7a5212]")}>
                          {v.stockGrams !== null ? (v.out ? `Out · ${formatWeight(v.stockGrams)} left` : `${formatWeight(v.stockGrams)} left`) : v.out ? "Out of stock" : `${v.stock} left`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
