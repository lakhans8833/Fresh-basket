"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, Link2, MapPin, Phone } from "lucide-react";
import {
  BOOKING_PAYMENT_LABEL, BOOKING_STATUS_LABEL, buildWhatsAppUrl, formatINR, nextBookingStatuses,
  type BookingPaymentMethod, type BookingPaymentStatus, type BookingStatus,
} from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { useAdminData, errorMessage } from "./use-admin-data";
import { Card, CardHeader, ConfirmDialog, LoadError, LoadingRows, PageHeader, formatDateTime, formatDay, Thumb } from "./ui";
import { BookingPaymentBadge, BookingStatusBadge } from "./bookings-list";

interface AdminBooking {
  id: string; bookingNumber: string; status: BookingStatus; paymentMethod: BookingPaymentMethod; paymentStatus: BookingPaymentStatus;
  customerName: string; customerPhone: string; addressLine: string; area: string | null; city: string; pincode: string;
  deliveryNotes: string | null; deliveryDate: string; slotLabel: string; subtotal: number; discount: number; deliveryFee: number;
  total: number; stockTaken: boolean; paymentLinkUrl: string | null; paymentReference: string | null; paidAt: string | null;
  cancelledReason: string | null; createdAt: string;
  items: { productName: string; variantLabel: string; unitPrice: number; quantity: number; lineTotal: number; imageUrl: string | null }[];
  events: { status: string; note: string | null; actor: string; createdAt: string }[];
}

const ACTION_LABEL: Record<BookingStatus, string> = {
  pending_confirmation: "Pending Confirmation",
  confirmed: "Confirm booking",
  preparing: "Mark Preparing",
  out_for_delivery: "Mark Out for Delivery",
  delivered: "Mark Delivered",
  cancelled: "Cancel booking",
};

export function AdminBookingDetail({ id }: { id: string }) {
  const toast = useToast();
  const { data, setData, error, reload } = useAdminData<{ booking: AdminBooking }>(`/api/admin/bookings/${id}`);
  const [pending, setPending] = useState<BookingStatus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reference, setReference] = useState("");

  async function patch(body: unknown, done: string) {
    setBusy(true);
    setActionError(null);
    try {
      const r = await api<{ booking: AdminBooking }>(`/api/admin/bookings/${id}`, { method: "PATCH", json: body });
      setData(r);
      toast(done);
      setPending(null);
      setNote("");
      setReference("");
    } catch (e) {
      setActionError(errorMessage(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <LoadingRows rows={6} />;
  const b = data.booking;
  const next = nextBookingStatuses(b.status);
  const chatUrl = buildWhatsAppUrl(`91${b.customerPhone}`, `Namaste ${b.customerName}, aapki booking ${b.bookingNumber} ke baare mein — `);
  const canMarkPaid = b.paymentStatus !== "paid" && b.status !== "cancelled" && b.paymentMethod !== "razorpay_link" &&
    (b.paymentMethod === "upi_qr" || b.status === "out_for_delivery" || b.status === "delivered");

  return (
    <>
      <Link href="/admin/bookings" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-forest-800 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All WhatsApp bookings</Link>
      <PageHeader
        title={b.bookingNumber}
        description={`Booked ${formatDateTime(b.createdAt)}`}
        actions={<div className="flex flex-wrap gap-1.5"><BookingStatusBadge status={b.status} /><BookingPaymentBadge status={b.paymentStatus} /></div>}
      />
      {b.status === "pending_confirmation" ? (
        <Notice tone="warning" className="mb-5" title="Not confirmed yet">
          Opening WhatsApp doesn&apos;t confirm a booking. Check that the customer&apos;s WhatsApp message arrived and the items are available, then press <b>Confirm booking</b>. Confirming takes the stock.
        </Notice>
      ) : null}
      {actionError ? <Notice tone="error" className="mb-5">{actionError}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Items" description={`${b.items.length} item${b.items.length === 1 ? "" : "s"} · prices checked on the server when booked`} />
            <ul className="divide-y divide-line">
              {b.items.map((i, k) => (
                <li key={k} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Thumb src={i.imageUrl} alt="" className="size-11" />
                  <div className="min-w-0 flex-1"><p className="font-medium text-ink">{i.productName}</p><p className="text-xs text-muted">{i.variantLabel} · {formatINR(i.unitPrice)} × {i.quantity}</p></div>
                  <span className="font-semibold tabular-nums">{formatINR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{formatINR(b.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery charges</dt><dd className="tabular-nums">{b.deliveryFee ? formatINR(b.deliveryFee) : "Free"}</dd></div>
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(b.total)}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 px-5 py-4 text-sm">
              {b.events.map((e, k) => (
                <li key={k} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-leaf-600" aria-hidden />
                  <div>
                    <p className="font-medium text-ink">{BOOKING_STATUS_LABEL[e.status as BookingStatus] ?? (e.status === "payment" ? "Payment" : e.status)}</p>
                    {e.note ? <p className="text-ink-soft">{e.note}</p> : null}
                    <p className="text-xs text-muted">{formatDateTime(e.createdAt)} · {e.actor.startsWith("staff:") ? "staff" : e.actor}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Update status" />
            <div className="space-y-2.5 p-5">
              {next.length === 0 ? <p className="text-sm text-muted">This booking is {BOOKING_STATUS_LABEL[b.status].toLowerCase()} — no further changes.</p> : null}
              {next.map((s) => (
                <Button key={s} variant={s === "cancelled" ? "ghost" : "primary"} className="w-full" disabled={busy} onClick={() => setPending(s)}>
                  {ACTION_LABEL[s]}
                </Button>
              ))}
              <p className="text-xs text-muted">Stock {b.stockTaken ? "has been taken for this booking (returned if cancelled)" : "is taken when you confirm"}.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="space-y-2 p-5 text-sm">
              <p className="font-semibold text-ink">{b.customerName}</p>
              <p className="flex items-center gap-2 text-ink-soft"><Phone className="size-4" aria-hidden /><a href={`tel:+91${b.customerPhone}`} className="hover:underline">+91 {b.customerPhone}</a></p>
              <p className="flex items-start gap-2 text-ink-soft"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[b.addressLine, b.area, `${b.city} - ${b.pincode}`].filter(Boolean).join(", ")}</p>
              <p className="text-ink-soft"><b className="text-ink">Delivery:</b> {formatDay(b.deliveryDate)}, {b.slotLabel}</p>
              {b.deliveryNotes ? <p className="rounded-xl bg-sage-50 p-2.5 text-ink-soft"><b className="text-ink">Instructions:</b> {b.deliveryNotes}</p> : null}
              <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-whatsapp-dark px-4 font-semibold text-white hover:bg-forest-800">
                <WhatsAppIcon className="size-4" /> Message customer
              </a>
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment" description={BOOKING_PAYMENT_LABEL[b.paymentMethod]} />
            <div className="space-y-3 p-5 text-sm">
              {b.paymentStatus === "paid" ? (
                <p className="text-forest-800">Paid{b.paidAt ? ` on ${formatDateTime(b.paidAt)}` : ""}{b.paymentReference ? ` · ref ${b.paymentReference}` : ""}</p>
              ) : <p className="text-ink-soft">Not paid yet.</p>}
              {b.paymentMethod === "razorpay_link" ? (
                b.paymentLinkUrl ? (
                  <p className="break-all"><Link2 className="mr-1 inline size-4" aria-hidden /><a href={b.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="text-forest-800 underline">{b.paymentLinkUrl}</a></p>
                ) : b.status !== "cancelled" && b.paymentStatus !== "paid" ? (
                  <Button variant="outline" disabled={busy} onClick={() => patch({ payment: "create_link" }, "Payment link created")}><CreditCard className="size-4" aria-hidden /> Create payment link</Button>
                ) : null
              ) : null}
              {b.paymentMethod === "razorpay_link" && b.paymentStatus !== "paid" ? <p className="text-xs text-muted">Marked paid automatically when Razorpay confirms the payment (signed webhook).</p> : null}
              {canMarkPaid ? (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void patch({ payment: "mark_paid", reference }, "Payment recorded"); }}>
                  <label htmlFor="pay-ref" className="block text-xs font-medium text-ink-soft">
                    {b.paymentMethod === "upi_qr" ? "UPI transaction ID (UTR) — check it in your UPI/bank app first" : "Cash received — receipt note"}
                  </label>
                  <Input id="pay-ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder={b.paymentMethod === "upi_qr" ? "e.g. 428912345678" : "e.g. Cash collected by Raju"} />
                  <Button type="submit" variant="outline" className="w-full" disabled={busy || reference.trim().length < 4}>Mark as paid</Button>
                </form>
              ) : null}
              {b.paymentMethod === "cod" && b.paymentStatus !== "paid" && !canMarkPaid && b.status !== "cancelled" ? (
                <p className="text-xs text-muted">Record cash once the order is out for delivery or delivered.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `${ACTION_LABEL[pending]}?` : ""}
        confirmLabel={pending ? ACTION_LABEL[pending] : "Confirm"}
        tone={pending === "cancelled" ? "danger" : "primary"}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={() => pending && patch({ status: pending, note: note.trim() || undefined }, `Booking ${BOOKING_STATUS_LABEL[pending].toLowerCase()}`)}
      >
        {pending === "confirmed" ? <p>This takes the items out of stock. Make sure you received the customer&apos;s WhatsApp message.</p> : null}
        {pending === "cancelled" ? <p>{b.stockTaken ? "The items go back into stock." : "No stock was taken yet."}</p> : null}
        <label htmlFor="booking-note" className="mt-3 block text-xs font-medium">Note (optional{pending === "cancelled" ? ", e.g. reason" : ""})</label>
        <Input id="booking-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}
