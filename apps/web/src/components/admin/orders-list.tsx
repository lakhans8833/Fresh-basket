"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClipboardList, Search, X, ChevronRight } from "lucide-react";
import { formatINR, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@freshbasket/shared";
import { Input } from "../ui/form";
import { EmptyState } from "../ui/feedback";
import { cn } from "../ui/cn";
import { useAdminData } from "./use-admin-data";
import { Badge, Card, LateBadge, LoadError, LoadingRows, OrderStatusBadge, PageHeader, PaymentStatusBadge, formatDay, timeAgo } from "./ui";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  deliveryDate: string;
  slotLabel: string;
  customerName: string;
  pincode: string;
  createdAt: string;
  itemCount: number;
  /** Still "placed" after its delivery slot ended. */
  late: boolean;
  channel: "web" | "whatsapp";
}

const TABS: { value: OrderStatus | "" | "late" | "whatsapp"; label: string }[] = [
  { value: "", label: "All" },
  { value: "late", label: "Late" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "pending_confirmation", label: "To confirm" },
  { value: "pending_payment", label: "Awaiting payment" },
  { value: "placed", label: "Placed" },
  { value: "packed", label: "Packed" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const METHOD: Record<PaymentMethod, string> = { cod: "Cash", razorpay: "Online", mock: "Test pay", upi: "UPI", razorpay_link: "Pay link" };

function WaBadge() {
  return <Badge tone="green" className="font-medium">WhatsApp</Badge>;
}

export function OrdersList({ initial }: { initial: { status: string; q: string; date: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState(TABS.some((t) => t.value === initial.status) ? initial.status : "");
  const [q, setQ] = useState(initial.q);
  const [debouncedQ, setDebouncedQ] = useState(initial.q);
  const [date, setDate] = useState(initial.date);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (debouncedQ) params.set("q", debouncedQ);
  if (date) params.set("date", date);
  const qs = params.toString();

  // Keep the URL shareable / back-button friendly.
  useEffect(() => {
    router.replace(qs ? `/admin/orders?${qs}` : "/admin/orders", { scroll: false });
  }, [qs, router]);

  const { data, error, loading, reload } = useAdminData<{ orders: OrderRow[] }>(`/api/admin/orders${qs ? `?${qs}` : ""}`);
  const orders = data?.orders ?? [];
  const filtered = Boolean(status || debouncedQ || date);

  return (
    <>
      <PageHeader title="Orders" description="Find an order, check what to pack, and move it along to delivery." />

      <div className="mb-4 -mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Filter by status" className="inline-flex gap-1 rounded-full border border-line bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.value || "all"}
              type="button"
              role="tab"
              aria-selected={status === t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                status === t.value ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-sage-100",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="order-search" className="sr-only">Search orders</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="order-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no., customer name or phone" className="pl-10" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="order-date" className="text-xs font-medium text-muted">Delivery date</label>
            <Input id="order-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[11rem]" />
          </div>
          {filtered ? (
            <button
              type="button"
              onClick={() => { setStatus(""); setQ(""); setDebouncedQ(""); setDate(""); }}
              className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-sage-100"
            >
              <X className="size-4" aria-hidden /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={6} />
      ) : orders.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-7" aria-hidden />} title={filtered ? "No matching orders" : "No orders yet"}>
          {filtered ? "Try another status, search or date." : "Orders appear here as soon as customers place them."}
        </EmptyState>
      ) : (
        <div aria-busy={loading} className={cn("transition-opacity", loading && "opacity-60")}>
          <p className="mb-2 text-sm text-muted" aria-live="polite">{orders.length} order{orders.length === 1 ? "" : "s"}{orders.length === 200 ? " (showing the latest 200)" : ""}</p>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-sage-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Delivery</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Payment</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className="group relative hover:bg-sage-50/70">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold text-forest-900 after:absolute after:inset-0 group-hover:underline">
                        {o.orderNumber}
                      </Link>
                      <div className="text-xs text-muted">{timeAgo(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-ink">{o.customerName}</div>
                      <div className="text-xs text-muted">PIN {o.pincode}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="text-ink">{formatDay(o.deliveryDate)}</div>
                      <div className="text-xs text-muted">{o.slotLabel.split(",")[0]}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <OrderStatusBadge status={o.status} />
                        {o.late ? <LateBadge /> : null}
                        {o.channel === "whatsapp" ? <WaBadge /> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <PaymentStatusBadge status={o.paymentStatus} />
                      <div className="mt-0.5 text-xs text-muted">{METHOD[o.paymentMethod]}</div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-ink">{formatINR(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="block rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] active:bg-sage-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-forest-900">{o.orderNumber}</p>
                      <p className="truncate text-sm text-ink-soft">{o.customerName} · PIN {o.pincode}</p>
                    </div>
                    <div className="flex items-center gap-1 font-semibold tabular-nums">{formatINR(o.total)}<ChevronRight className="size-4 text-muted" aria-hidden /></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    {o.late ? <LateBadge /> : null}
                    {o.channel === "whatsapp" ? <WaBadge /> : null}
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Deliver {formatDay(o.deliveryDate)}, {o.slotLabel.split(",")[0]} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · {timeAgo(o.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
