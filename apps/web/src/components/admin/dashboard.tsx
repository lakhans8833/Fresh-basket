"use client";

import Link from "next/link";
import { AlarmClock, ArrowRight, ClipboardList, IndianRupee, PackageOpen, Truck, Clock, RotateCcw, AlertTriangle, MessageSquare, RotateCw } from "lucide-react";
import { formatINR, type Order } from "@freshbasket/shared";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/feedback";
import { cn } from "../ui/cn";
import { useAdminData } from "./use-admin-data";
import { Card, CardHeader, LoadError, OrderStatusBadge, PageHeader, PaymentStatusBadge, formatDay, timeAgo } from "./ui";

export interface Stats {
  ordersToday: number;
  revenueToday: number;
  toFulfil: number;
  outForDelivery: number;
  awaitingPayment: number;
  refundsPending: number;
  lowStockCount: number;
  lateOrders: number;
  openMessages: number;
  recent: Order[];
  lowStock: { variantId: string; productName: string; label: string; stock: number }[];
}

export function Dashboard({ initial }: { initial?: Stats | null }) {
  const { data, error, loading, reload } = useAdminData<Stats>("/api/admin/stats", initial);

  const cards = data
    ? [
        { label: "Orders today", value: data.ordersToday, icon: ClipboardList, href: "/admin/orders" },
        { label: "Revenue today", value: formatINR(data.revenueToday), icon: IndianRupee, hint: "Paid + cash on delivery" },
        { label: "To fulfil", value: data.toFulfil, icon: PackageOpen, href: "/admin/orders?status=placed", attention: data.toFulfil > 0 },
        { label: "Late orders", value: data.lateOrders, icon: AlarmClock, href: "/admin/orders?status=late", warn: data.lateOrders > 0, hint: "Slot over, still not packed" },
        { label: "Out for delivery", value: data.outForDelivery, icon: Truck, href: "/admin/orders?status=out_for_delivery" },
        { label: "Awaiting payment", value: data.awaitingPayment, icon: Clock, href: "/admin/orders?status=pending_payment" },
        { label: "Refunds pending", value: data.refundsPending, icon: RotateCcw, href: "/admin/orders?status=cancelled", warn: data.refundsPending > 0 },
        { label: "Low stock", value: data.lowStockCount, icon: AlertTriangle, href: "/admin/inventory?filter=low", warn: data.lowStockCount > 0 },
        { label: "Open messages", value: data.openMessages, icon: MessageSquare, href: "/admin/messages", attention: data.openMessages > 0 },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today at a glance. Figures use India time."
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
              <CardHeader id="low-stock" title="Low stock" description="Active items with 5 or fewer left" actions={<Link href="/admin/inventory?filter=low" className="text-sm font-semibold text-leaf-600 hover:text-forest-800">Inventory</Link>} />
              {!data ? (
                <div className="space-y-2 p-5"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
              ) : data.lowStock.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted">Everything is well stocked.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.lowStock.map((v) => (
                    <li key={v.variantId}>
                      <Link href={`/admin/inventory?q=${encodeURIComponent(v.productName)}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sage-50 sm:px-6">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{v.productName}</span>
                          <span className="text-xs text-muted">{v.label}</span>
                        </span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums", v.stock === 0 ? "bg-danger-bg text-danger" : "bg-[#fdf6e7] text-[#7a5212]")}>
                          {v.stock === 0 ? "Out of stock" : `${v.stock} left`}
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
