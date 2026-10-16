"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft, Printer, PackageCheck, Truck, Home as HomeIcon, XCircle, Banknote, RotateCcw, Phone, MapPin, CalendarClock, StickyNote, ClipboardList, Clock, User,
  BadgeCheck, MessageCircle,
} from "lucide-react";
import {
  allowedAdminTransitions, formatINR, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL,
  type Order, type OrderStatus,
} from "@freshbasket/shared";
import { Checkbox, Input } from "../ui/form";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Notice } from "../ui/feedback";
import { Textarea } from "../ui/form";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, useAdminData } from "./use-admin-data";
import { useAdmin } from "./admin-context";
import { Card, CardHeader, LateBadge, LoadError, LoadingRows, OrderStatusBadge, PageHeader, PaymentStatusBadge, Thumb, formatDateTime, formatDay } from "./ui";

interface AdminOrder extends Order {
  userId: string;
  razorpayOrderId: string | null;
  payments: { provider: string; paymentId: string | null; amount: number; status: string; source: string; createdAt: string }[];
  customer: { email: string | null; fullName: string | null; phone: string | null } | null;
  /** Still "placed" after its delivery slot ended. */
  late?: boolean;
  /** WhatsApp order-update log (one row per event). */
  notifications?: { event: string; status: string; recipient: string | null; error: string | null; attempts: number; updatedAt: string }[];
}

const NOTIFY_LABEL: Record<string, string> = { confirmed: "Order confirmed", packed: "Packed", out_for_delivery: "Out for delivery", delivered: "Delivered" };

/** Admin confirms a UPI payment after checking the bank / UPI business app. Never automatic. */
function UpiVerifyCard({ order, onDone }: { order: AdminOrder; onDone: (o: AdminOrder) => void }) {
  const { role } = useAdmin();
  const toast = useToast();
  const [ref, setRef] = useState(order.upiReference ?? "");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ order: AdminOrder; result?: string }>(`/api/admin/orders/${order.id}`, { method: "PATCH", json: { confirmUpi: { reference: ref, amountReceived: true } } });
      onDone(r.order);
      if (r.result === "paid" || r.result === "paid_late" || !r.result) toast("UPI payment confirmed — order is now placed");
      else if (r.result === "refund_required") toast("Payment recorded, but the order was already cancelled — refund the customer");
      else toast(`Not marked paid (${r.result.replaceAll("_", " ")}) — check the order history`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mb-6 border-2 border-[#f0d9a6] bg-[#fffaf0] p-4 sm:p-5" aria-labelledby="upi-verify-h">
      <h2 id="upi-verify-h" className="flex items-center gap-2 text-lg font-semibold text-forest-900"><BadgeCheck className="size-5" aria-hidden /> Verify UPI payment</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {order.upiReference ? <>Customer says they paid with reference <b>{order.upiReference}</b>.</> : <>The customer hasn&apos;t sent a UPI reference yet.</>}{" "}
        Check your bank or UPI business app for <b>{formatINR(order.total)}</b> with this reference before confirming. A screenshot or UTR alone is not proof.
      </p>
      {role === "admin" ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="text-sm font-medium text-ink-soft" htmlFor="upi-utr">UTR / reference you found in the bank statement</label>
          <Input id="upi-utr" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} className="max-w-xs" autoComplete="off" />
          <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} label={`I checked: ${formatINR(order.total)} for this order has arrived in our account.`} />
          {err ? <Notice tone="error">{err}</Notice> : null}
          <div><Button variant="dark" loading={busy} disabled={!checked || !ref.trim()} onClick={submit}><BadgeCheck className="size-4" aria-hidden /> Mark UPI payment received</Button></div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Ask an admin to confirm the payment.</p>
      )}
    </Card>
  );
}

const ACTION: Record<OrderStatus, { label: string; icon: typeof PackageCheck; help: string }> = {
  pending_payment: { label: "", icon: Clock, help: "" },
  pending_confirmation: { label: "", icon: Clock, help: "" },
  placed: { label: "Confirm order", icon: ClipboardList, help: "You got the customer's WhatsApp message and can deliver it. Sends the “confirmed” update if they asked for updates." },
  packed: { label: "Mark packed", icon: PackageCheck, help: "Items are picked, weighed and bagged." },
  out_for_delivery: { label: "Out for delivery", icon: Truck, help: "The order has left the store with a rider." },
  delivered: { label: "Mark delivered", icon: HomeIcon, help: "The customer has received the order." },
  cancelled: { label: "Cancel order", icon: XCircle, help: "Stock is released. Paid online orders move to “Refund pending”." },
};

type Pending = { kind: "status"; to: OrderStatus } | { kind: "payment"; to: "cod_collected" | "refunded" };

export function AdminOrderDetail({ id }: { id: string }) {
  const toast = useToast();
  const { storeName } = useAdmin();
  const { data, setData, error, reload } = useAdminData<{ order: AdminOrder }>(`/api/admin/orders/${id}`);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error && !data) {
    return (
      <>
        <BackLink />
        <LoadError message={error} onRetry={reload} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <BackLink />
        <div className="skeleton mb-6 h-10 w-64" />
        <LoadingRows rows={4} />
      </>
    );
  }

  const o = data.order;
  const transitions = allowedAdminTransitions(o.status);
  const forward = transitions.filter((t) => t !== "cancelled");
  const canCancel = transitions.includes("cancelled");
  const canCollect = o.paymentStatus === "cod_pending" && o.status === "delivered";
  const canRefund = o.paymentStatus === "refund_pending";

  function open(p: Pending) {
    setPending(p);
    setNote("");
    setActionError(null);
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      const body = pending.kind === "status" ? { status: pending.to, note: note.trim() || null } : { paymentStatus: pending.to };
      const r = await api<{ order: AdminOrder }>(`/api/admin/orders/${o.id}`, { method: "PATCH", json: body });
      setData(r);
      toast(
        pending.kind === "status"
          ? pending.to === "placed" ? "Order confirmed" : `Order ${ORDER_STATUS_LABEL[pending.to].toLowerCase()}`
          : pending.to === "cod_collected" ? "Cash collection recorded" : "Marked as refunded",
      );
      setPending(null);
    } catch (e) {
      setActionError(errorMessage(e));
      void reload(); // someone else may have moved it on
    } finally {
      setBusy(false);
    }
  }

  const dialogTitle = !pending
    ? ""
    : pending.kind === "status"
      ? pending.to === "cancelled" ? `Cancel order ${o.orderNumber}?` : `${ACTION[pending.to].label}?`
      : pending.to === "cod_collected" ? `Record ${formatINR(o.total)} cash collected?` : "Mark refund as completed?";

  return (
    <>
      <div className="print:hidden">
        <BackLink />
        <PageHeader
          title={`Order ${o.orderNumber}`}
          description={`Placed ${formatDateTime(o.createdAt)}`}
          actions={
            <>
              <OrderStatusBadge status={o.status} />
              {o.late ? <LateBadge /> : null}
              <PaymentStatusBadge status={o.paymentStatus} />
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden /> Packing slip
              </Button>
            </>
          }
        />

        {actionError && !pending ? <Notice tone="error" className="mb-5">{actionError}</Notice> : null}
        {o.paymentMethod === "upi" && (o.paymentStatus === "pending" || o.paymentStatus === "failed") && (o.status === "pending_payment" || o.status === "cancelled") ? (
          <UpiVerifyCard order={o} onDone={(n) => setData({ order: n })} />
        ) : null}

        {/* Actions */}
        {forward.length || canCancel || canCollect || canRefund || o.paymentStatus === "cod_pending" || o.status === "pending_payment" ? (
          <Card className="mb-6 p-4 sm:p-5" aria-label="Order actions">
            <div className="flex flex-wrap items-center gap-2">
              {forward.map((t) => {
                const Icon = ACTION[t].icon;
                return (
                  <Button key={t} onClick={() => open({ kind: "status", to: t })}>
                    <Icon className="size-4" aria-hidden /> {ACTION[t].label}
                  </Button>
                );
              })}
              {canCollect ? (
                <Button variant="lime" onClick={() => open({ kind: "payment", to: "cod_collected" })}>
                  <Banknote className="size-4" aria-hidden /> Record cash collected
                </Button>
              ) : null}
              {canRefund ? (
                <Button variant="dark" onClick={() => open({ kind: "payment", to: "refunded" })}>
                  <RotateCcw className="size-4" aria-hidden /> Mark refunded
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="danger" className="sm:ml-auto" onClick={() => open({ kind: "status", to: "cancelled" })}>
                  <XCircle className="size-4" aria-hidden /> Cancel order
                </Button>
              ) : null}
            </div>
            {o.status === "pending_payment" && o.paymentMethod === "upi" ? (
              <p className="mt-3 text-sm text-muted">Waiting for the customer&apos;s UPI payment. Confirm it above once you see the money in your account.</p>
            ) : o.status === "pending_payment" ? (
              <p className="mt-3 text-sm text-muted">
                Waiting for the customer&apos;s online payment. It moves to “Order placed” automatically once the payment gateway confirms it — it can&apos;t be marked paid by hand.
              </p>
            ) : o.paymentStatus === "cod_pending" && !canCollect && o.status !== "cancelled" ? (
              <p className="mt-3 text-sm text-muted">Cash on delivery: record the cash once the order is delivered.</p>
            ) : canRefund ? (
              <p className="mt-3 text-sm text-muted">Issue the refund from your payment gateway dashboard first, then mark it here.</p>
            ) : null}
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-start">
          <div className="space-y-6">
            <Card aria-labelledby="items-h">
              <CardHeader id="items-h" title={`Items (${o.items.length})`} />
              <ul className="divide-y divide-line">
                {o.items.map((it, i) => (
                  <li key={`${it.variantId}-${i}`} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <Thumb src={it.imageUrl} alt={it.productName} className="size-12 shrink-0 overflow-hidden rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{it.productName}</p>
                      <p className="text-sm text-muted">{it.variantLabel} · {formatINR(it.unitPrice)} each</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted">× {it.quantity}</p>
                      <p className="font-semibold tabular-nums">{formatINR(it.lineTotal)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1.5 border-t border-line px-5 py-4 text-sm sm:px-6">
                <Row label="Subtotal" value={formatINR(o.subtotal)} />
                {o.discount ? <Row label={`Discount${o.couponCode ? ` (${o.couponCode})` : ""}`} value={`− ${formatINR(o.discount)}`} className="text-leaf-600" /> : null}
                <Row label="Delivery" value={o.deliveryFee ? formatINR(o.deliveryFee) : "Free"} />
                <Row label="Total" value={formatINR(o.total)} className="pt-1.5 text-base font-semibold text-forest-900" />
              </dl>
            </Card>

            <Card aria-labelledby="timeline-h">
              <CardHeader id="timeline-h" title="Timeline" />
              <ol className="px-5 py-4 sm:px-6">
                {[...o.events].reverse().map((e, i, arr) => (
                  <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < arr.length - 1 ? <span aria-hidden className="absolute left-[0.4375rem] top-5 h-[calc(100%-0.75rem)] w-px bg-line" /> : null}
                    <span aria-hidden className={cn("mt-1.5 size-3.5 shrink-0 rounded-full border-2", i === 0 ? "border-leaf-600 bg-lime-200" : "border-sage-200 bg-white")} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{ORDER_STATUS_LABEL[e.status]}</p>
                      {e.note ? <p className="text-sm text-ink-soft">{e.note}</p> : null}
                      <p className="text-xs text-muted">{formatDateTime(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="space-y-6">
            <Card aria-labelledby="cust-h" className="p-5">
              <h2 id="cust-h" className="text-lg font-semibold text-forest-900">Customer &amp; delivery</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex gap-2.5">
                  <User className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <div>
                    <p className="font-medium text-ink">{o.address.fullName}</p>
                    {o.customer?.email ? <p className="text-muted">{o.customer.email}</p> : null}
                  </div>
                </li>
                <li className="flex gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <a href={`tel:+91${o.address.phone}`} className="font-medium text-leaf-600 hover:underline">+91 {o.address.phone}</a>
                </li>
                <li className="flex gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <address className="not-italic text-ink-soft">
                    {o.address.line1}
                    {o.address.line2 ? <>, {o.address.line2}</> : null}
                    {o.address.landmark ? <><br />Near {o.address.landmark}</> : null}
                    <br />
                    {o.address.city}, {o.address.state} {o.address.pincode}
                  </address>
                </li>
                <li className="flex gap-2.5">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <div>
                    <p className="font-medium text-ink">{formatDay(o.deliveryDate)}</p>
                    <p className="text-muted">{o.slotLabel}</p>
                  </div>
                </li>
                {o.customerNote ? (
                  <li className="flex gap-2.5 rounded-xl bg-lime-50 p-3">
                    <StickyNote className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden />
                    <p className="text-ink-soft"><span className="font-semibold text-forest-800">Note: </span>{o.customerNote}</p>
                  </li>
                ) : null}
              </ul>
            </Card>

            <Card aria-labelledby="pay-h" className="p-5">
              <h2 id="pay-h" className="text-lg font-semibold text-forest-900">Payment</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="Method" value={PAYMENT_METHOD_LABEL[o.paymentMethod]} />
                <Row label="Status" value={PAYMENT_STATUS_LABEL[o.paymentStatus]} />
                <Row label="Ordered via" value={o.channel === "whatsapp" ? "WhatsApp" : "Website"} />
                {o.upiReference ? <Row label="UPI reference" value={<code className="text-xs">{o.upiReference}</code>} /> : null}
                {o.paymentLinkUrl ? <Row label="Payment link" value={<a href={o.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-leaf-600 underline">{o.paymentLinkUrl}</a>} /> : null}
                {o.razorpayOrderId ? <Row label="Gateway order" value={<code className="text-xs">{o.razorpayOrderId}</code>} /> : null}
              </dl>
              {o.payments.length ? (
                <ul className="mt-4 space-y-2">
                  {o.payments.map((p, i) => (
                    <li key={i} className="rounded-xl border border-line px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize text-ink">{p.provider} · {p.status}</span>
                        <span className="font-semibold tabular-nums">{formatINR(p.amount)}</span>
                      </div>
                      <p className="mt-0.5 break-all text-xs text-muted">
                        {p.paymentId ? `${p.paymentId} · ` : ""}via {p.source} · {formatDateTime(p.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">No gateway payments recorded{o.paymentMethod === "cod" ? " (cash order)" : ""}.</p>
              )}
            </Card>

            <Card aria-labelledby="wa-h" className="p-5">
              <h2 id="wa-h" className="flex items-center gap-2 text-lg font-semibold text-forest-900"><MessageCircle className="size-5" aria-hidden /> WhatsApp updates</h2>
              <p className="mt-1 text-sm text-muted">{o.whatsappUpdates ? "Customer opted in to order updates on WhatsApp." : "Customer did not opt in — no WhatsApp updates are sent."}</p>
              {o.notifications?.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {o.notifications.map((n) => (
                    <li key={n.event} className="rounded-xl border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">{NOTIFY_LABEL[n.event] ?? n.event}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", n.status === "sent" ? "bg-lime-100 text-forest-800" : n.status === "failed" ? "bg-danger-bg text-danger" : "bg-sage-100 text-ink-soft")}>{n.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{formatDateTime(n.updatedAt)}{n.attempts > 1 ? ` · ${n.attempts} attempts` : ""}</p>
                      {n.error ? <p className="mt-0.5 break-words text-xs text-danger">{n.error}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </div>
        </div>
      </div>

      <PackingSlip order={o} storeName={storeName} />

      <ActionDialog
        open={pending !== null}
        title={dialogTitle}
        danger={pending?.kind === "status" && pending.to === "cancelled"}
        confirmLabel={!pending ? "" : pending.kind === "status" ? ACTION[pending.to].label : pending.to === "cod_collected" ? "Record cash" : "Mark refunded"}
        busy={busy}
        error={pending ? actionError : null}
        withNote={pending?.kind === "status"}
        note={note}
        onNote={setNote}
        help={!pending ? "" : pending.kind === "status" ? ACTION[pending.to].help : pending.to === "cod_collected" ? "Confirm the rider handed over the cash for this order." : "Only do this after the money has been returned to the customer."}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  );
}

function BackLink() {
  return (
    <Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-800 print:hidden">
      <ArrowLeft className="size-4" aria-hidden /> All orders
    </Link>
  );
}

function Row({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-4", className)}>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function ActionDialog({
  open, title, help, danger, confirmLabel, busy, error, withNote, note, onNote, onConfirm, onClose,
}: {
  open: boolean; title: string; help: string; danger: boolean; confirmLabel: string; busy: boolean; error: string | null;
  withNote: boolean; note: string; onNote: (v: string) => void; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-white p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-forest-950/40"
    >
      <form className="p-6" onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
        <h2 id={titleId} className="text-xl font-semibold text-forest-900">{title}</h2>
        {help ? <p className="mt-1.5 text-sm text-ink-soft">{help}</p> : null}
        {withNote ? (
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-medium text-ink-soft">
              {danger ? "Reason (shown to the customer)" : "Note (optional)"}
            </label>
            <Textarea id={noteId} value={note} onChange={(e) => onNote(e.target.value)} maxLength={300} className="min-h-20" placeholder={danger ? "e.g. Item unavailable today" : "e.g. Rider: Ravi"} />
          </div>
        ) : null}
        {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Go back</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  );
}

/** Only visible when printing. */
function PackingSlip({ order: o, storeName }: { order: AdminOrder; storeName: string }) {
  return (
    <div className="hidden text-[11pt] text-black print:block">
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="font-display text-2xl font-semibold">{storeName}</p>
          <p>Packing slip</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">{o.orderNumber}</p>
          <p>Deliver: {formatDay(o.deliveryDate)} · {o.slotLabel}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="font-bold">Deliver to</p>
          <p>{o.address.fullName} · +91 {o.address.phone}</p>
          <p>{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ""}</p>
          {o.address.landmark ? <p>Near {o.address.landmark}</p> : null}
          <p>{o.address.city}, {o.address.state} {o.address.pincode}</p>
        </div>
        <div>
          <p className="font-bold">Payment</p>
          <p>{o.paymentMethod === "cod" && o.paymentStatus === "cod_pending" ? `CASH ON DELIVERY — collect ${formatINR(o.total)}` : `${PAYMENT_METHOD_LABEL[o.paymentMethod]} — ${PAYMENT_STATUS_LABEL[o.paymentStatus]}`}</p>
          {o.customerNote ? <p className="mt-2"><b>Note:</b> {o.customerNote}</p> : null}
        </div>
      </div>
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="w-8 py-1.5">✓</th><th className="py-1.5">Item</th><th className="py-1.5">Pack</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((it, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-1.5"><span className="inline-block size-4 border border-black" /></td>
              <td className="py-1.5">{it.productName}</td>
              <td className="py-1.5">{it.variantLabel}</td>
              <td className="py-1.5 text-right font-bold">{it.quantity}</td>
              <td className="py-1.5 text-right">{formatINR(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-3 w-64 space-y-0.5">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatINR(o.subtotal)}</span></p>
        {o.discount ? <p className="flex justify-between"><span>Discount</span><span>− {formatINR(o.discount)}</span></p> : null}
        <p className="flex justify-between"><span>Delivery</span><span>{o.deliveryFee ? formatINR(o.deliveryFee) : "Free"}</span></p>
        <p className="flex justify-between border-t border-black pt-1 font-bold"><span>Total</span><span>{formatINR(o.total)}</span></p>
      </div>
    </div>
  );
}
