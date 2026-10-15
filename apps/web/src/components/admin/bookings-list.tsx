"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Search } from "lucide-react";
import {
  BOOKING_PAYMENT_LABEL, BOOKING_STATUS_LABEL, formatINR,
  type BookingPaymentMethod, type BookingPaymentStatus, type BookingStatus,
} from "@freshbasket/shared";
import { Input } from "../ui/form";
import { EmptyState } from "../ui/feedback";
import { cn } from "../ui/cn";
import { useAdminData } from "./use-admin-data";
import { Badge, Card, LoadError, LoadingRows, PageHeader, formatDay, timeAgo } from "./ui";

interface Row {
  id: string; bookingNumber: string; status: BookingStatus; paymentMethod: BookingPaymentMethod; paymentStatus: BookingPaymentStatus;
  customerName: string; customerPhone: string; pincode: string; total: number; deliveryDate: string; slotLabel: string;
  createdAt: string; itemCount: number;
}

export function bookingTone(s: BookingStatus) {
  return s === "pending_confirmation" ? "amber" : s === "cancelled" ? "red" : s === "delivered" ? "green" : s === "out_for_delivery" ? "dark" : s === "preparing" ? "lime" : "neutral";
}
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={bookingTone(status)}>{BOOKING_STATUS_LABEL[status]}</Badge>;
}
export function BookingPaymentBadge({ status }: { status: BookingPaymentStatus }) {
  return <Badge tone={status === "paid" ? "green" : status === "refunded" ? "red" : "neutral"} className="font-medium">{status === "paid" ? "Paid" : status === "refunded" ? "Refunded" : "Unpaid"}</Badge>;
}

const TABS: { value: BookingStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending_confirmation", label: "Pending Confirmation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export function BookingsList() {
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (debounced) params.set("q", debounced);
  const qs = params.toString();
  const { data, error, loading, reload } = useAdminData<{ bookings: Row[]; pending: number }>(`/api/admin/bookings${qs ? `?${qs}` : ""}`);

  // New bookings arrive while the page is open: refresh every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const rows = data?.bookings ?? [];
  return (
    <>
      <PageHeader
        title="WhatsApp bookings"
        description="Bookings saved from the website before the customer opened WhatsApp. Check the customer's WhatsApp message, then confirm the booking here."
        eyebrow={data?.pending ? <span className="text-amber">{data.pending} waiting for confirmation</span> : undefined}
      />
      <div className="mb-4 -mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Filter by status" className="inline-flex gap-1 rounded-full border border-line bg-white p-1">
          {TABS.map((t) => (
            <button key={t.value || "all"} type="button" role="tab" aria-selected={status === t.value} onClick={() => setStatus(t.value)}
              className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", status === t.value ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-sage-100")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mb-5">
        <label htmlFor="booking-search" className="sr-only">Search bookings</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input id="booking-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Booking ID, customer name or mobile" className="pl-10" />
      </div>

      {error && !data ? <LoadError message={error} onRetry={reload} /> : !data ? <LoadingRows rows={6} /> : rows.length === 0 ? (
        <EmptyState icon={<MessageCircle className="size-7" aria-hidden />} title={status || debounced ? "No matching bookings" : "No WhatsApp bookings yet"}>
          Bookings appear here as soon as a customer taps “Confirm Booking on WhatsApp”.
        </EmptyState>
      ) : (
        <div aria-busy={loading}>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-sage-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Booking</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Delivery</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Payment</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b) => (
                  <tr key={b.id} className={cn("group relative hover:bg-sage-50/70", b.status === "pending_confirmation" && "bg-[#fffbf1]")}>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/bookings/${b.id}`} className="font-semibold text-forest-900 after:absolute after:inset-0 group-hover:underline">{b.bookingNumber}</Link>
                      <div className="text-xs text-muted">{timeAgo(b.createdAt)} · {b.itemCount} item{b.itemCount === 1 ? "" : "s"}</div>
                    </td>
                    <td className="px-3 py-3.5"><div className="font-medium text-ink">{b.customerName}</div><div className="text-xs text-muted">{b.customerPhone} · PIN {b.pincode}</div></td>
                    <td className="px-3 py-3.5"><div className="text-ink">{formatDay(b.deliveryDate)}</div><div className="text-xs text-muted">{b.slotLabel.split(",")[0]}</div></td>
                    <td className="px-3 py-3.5"><BookingStatusBadge status={b.status} /></td>
                    <td className="px-3 py-3.5"><BookingPaymentBadge status={b.paymentStatus} /><div className="mt-0.5 text-xs text-muted">{BOOKING_PAYMENT_LABEL[b.paymentMethod]}</div></td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatINR(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-3 md:hidden">
            {rows.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/bookings/${b.id}`} className="block rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] active:bg-sage-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="font-semibold text-forest-900">{b.bookingNumber}</p><p className="truncate text-sm text-ink-soft">{b.customerName} · {b.customerPhone}</p></div>
                    <div className="flex items-center gap-1 font-semibold tabular-nums">{formatINR(b.total)}<ChevronRight className="size-4 text-muted" aria-hidden /></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5"><BookingStatusBadge status={b.status} /><BookingPaymentBadge status={b.paymentStatus} /></div>
                  <p className="mt-2 text-xs text-muted">Deliver {formatDay(b.deliveryDate)}, {b.slotLabel.split(",")[0]} · {BOOKING_PAYMENT_LABEL[b.paymentMethod]} · {timeAgo(b.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
