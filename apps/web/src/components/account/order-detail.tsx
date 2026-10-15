"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, PackageCheck, Truck, ClipboardList, Home as HomeIcon, XCircle, RotateCcw, CreditCard, PartyPopper, Clock, ExternalLink } from "lucide-react";
import {
  canCustomerCancel, formatINR, formatSlotTime, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, TRACKING_STEPS,
  type Order, type OrderStatus, type PlaceOrderResponse,
} from "@freshbasket/shared";
import { UpiPayPanel, type UpiInfo } from "./upi-pay-panel";
import { api } from "@/lib/client/api";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { Button } from "../ui/button";
import { Notice } from "../ui/feedback";
import { ProductImage } from "../product/product-image";
import { cn } from "../ui/cn";

const STEP_ICON: Record<OrderStatus, typeof Check> = {
  pending_payment: Clock, placed: ClipboardList, packed: PackageCheck, out_for_delivery: Truck, delivered: HomeIcon, cancelled: XCircle,
};

export function statusTone(s: OrderStatus) {
  return s === "cancelled" ? "bg-danger-bg text-danger" : s === "delivered" ? "bg-lime-100 text-forest-800" : s === "pending_payment" ? "bg-[#fdf6e7] text-[#7a5212]" : "bg-sage-100 text-forest-800";
}

export function formatDeliveryDate(d: string) {
  return new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Order page. mode "account": the signed-in customer's own order (cancel / reorder).
 * mode "track": opened from a secret tracking link (no account needed) — the server has already
 * masked the address and phone; no cancel/reorder.
 */
export function OrderDetail({
  order, justPlaced, mode = "account", trackKey, upi,
}: { order: Order; justPlaced: boolean; mode?: "account" | "track"; trackKey?: string; upi?: UpiInfo | null }) {
  const router = useRouter();
  const { add, lines } = useCart();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always show the latest status from the database: every 5 s while waiting for an online payment
  // (webhook), every 30 s while the order is on its way; stop once it's delivered or cancelled.
  useEffect(() => {
    if (order.status === "delivered" || order.status === "cancelled") return;
    const waitingForGateway = order.status === "pending_payment" && order.paymentMethod !== "upi";
    const t = setInterval(() => router.refresh(), waitingForGateway ? 5000 : 30_000);
    return () => clearInterval(t);
  }, [order.status, order.paymentMethod, router]);

  const currentIdx = TRACKING_STEPS.indexOf(order.status);
  const eventFor = (s: OrderStatus) => [...order.events].reverse().find((e) => e.status === s);

  async function cancel() {
    if (!confirm("Cancel this order? Items will be released.")) return;
    setBusy("cancel");
    setError(null);
    try {
      await api(`/api/orders/${order.id}/cancel`, { method: "POST" });
      toast("Order cancelled");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reorder() {
    setBusy("reorder");
    try {
      const r = await api<{ items: { variantId: string; quantity: number; productSlug: string }[]; skipped: string[] }>(`/api/orders/${order.id}/reorder`, { method: "POST" });
      for (const it of r.items) {
        const src = order.items.find((i) => i.variantId === it.variantId)!;
        const existing = lines.find((l) => l.variantId === it.variantId)?.quantity ?? 0;
        if (it.quantity > existing) add({ variantId: it.variantId, productName: src.productName, productSlug: it.productSlug, variantLabel: src.variantLabel, imageUrl: src.imageUrl, priceHint: src.unitPrice }, it.quantity - existing);
      }
      toast(r.skipped.length ? `Added ${r.items.length} items. Not available: ${r.skipped.join(", ")}` : "Items added to your cart");
      router.push("/cart");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function resumePayment() {
    setBusy("pay");
    try {
      const r = await api<PlaceOrderResponse>(`/api/orders/${order.id}/pay`, { method: "POST" });
      const u = new URL(r.payment!.payUrl);
      router.push(`${u.pathname}${u.search}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="container-page pt-6 md:pt-10">
      {justPlaced && order.status !== "pending_payment" && order.status !== "cancelled" ? (
        <div className="mb-6 flex items-center gap-4 rounded-[var(--radius-card)] bg-forest-800 p-5 text-white sm:p-6" role="status">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-lime-300 text-forest-900"><PartyPopper className="size-6" aria-hidden /></span>
          <div>
            <h1 className="text-2xl font-semibold">Thank you! Your order is confirmed.</h1>
            <p className="text-white/75">We&apos;ll deliver on {formatDeliveryDate(order.deliveryDate)}, {order.slotLabel.split(",")[0]}.</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {mode === "account" ? <Link href="/account/orders" className="text-sm text-muted hover:text-forest-800">← All orders</Link> : <p className="text-sm text-muted">Order tracking</p>}
          <h2 className="mt-1 text-[2rem] font-semibold text-forest-900 md:text-4xl">Order {order.orderNumber}</h2>
          <p className="text-sm text-muted">Placed {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", statusTone(order.status))}>{ORDER_STATUS_LABEL[order.status]}</span>
          <span className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-soft">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</span>
        </div>
      </div>

      {error ? <Notice tone="error" className="mt-5">{error}</Notice> : null}

      {order.status === "pending_payment" && order.paymentMethod === "upi" && upi ? (
        <UpiPayPanel orderId={order.id} trackKey={trackKey} info={upi} reported={order.upiReference} orderNumber={order.orderNumber} holdUntil={order.reservationExpiresAt} />
      ) : order.status === "pending_payment" && order.paymentMethod === "razorpay_link" ? (
        <Notice tone="warning" className="mt-5" title="Waiting for payment">
          Pay {formatINR(order.total)} with the secure Razorpay link. This page updates once Razorpay confirms the payment — a screenshot isn&apos;t needed.
          {order.paymentLinkUrl ? (
            <div className="mt-3">
              <a href={order.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-forest-800 px-4 text-sm font-semibold text-white hover:bg-forest-900">
                <CreditCard className="size-4" aria-hidden /> Pay {formatINR(order.total)} now <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
          ) : null}
        </Notice>
      ) : order.status === "pending_payment" && mode === "account" ? (
        <Notice tone="warning" className="mt-5" title="Waiting for payment">
          Your items are held until {order.reservationExpiresAt ? new Date(order.reservationExpiresAt).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }) : "shortly"}. If you&apos;ve already paid, this page updates automatically once the payment is confirmed.
          <div className="mt-3"><Button size="sm" variant="dark" loading={busy === "pay"} onClick={resumePayment}><CreditCard className="size-4" aria-hidden /> Complete payment</Button></div>
        </Notice>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <section aria-labelledby="track" className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
            <h3 id="track" className="text-xl font-semibold text-forest-900">Tracking</h3>
            {order.status === "cancelled" ? (
              <div className="mt-4 flex gap-3 rounded-2xl bg-danger-bg p-4 text-sm text-danger">
                <XCircle className="size-5 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">This order was cancelled.</p>
                  <p>{eventFor("cancelled")?.note}</p>
                  {order.paymentStatus === "refund_pending" ? <p className="mt-1">A refund of {formatINR(order.total)} is being processed.</p> : null}
                  {order.paymentStatus === "refunded" ? <p className="mt-1">Your refund has been issued.</p> : null}
                </div>
              </div>
            ) : (
              <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4 sm:gap-2">
                {TRACKING_STEPS.map((s, i) => {
                  const Icon = STEP_ICON[s];
                  const done = currentIdx >= i;
                  const ev = eventFor(s);
                  return (
                    <li key={s} className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center" aria-current={currentIdx === i ? "step" : undefined}>
                      {i < TRACKING_STEPS.length - 1 ? (
                        <span aria-hidden className={cn("absolute left-5 top-11 h-[calc(100%-1.5rem)] w-0.5 sm:left-[calc(50%+1.5rem)] sm:top-5 sm:h-0.5 sm:w-[calc(100%-3rem)]", currentIdx > i ? "bg-leaf-500" : "bg-line")} />
                      ) : null}
                      <span className={cn("relative z-10 grid size-10 shrink-0 place-items-center rounded-full", done ? "bg-forest-800 text-white" : "border border-line bg-white text-muted")}>
                        <Icon className="size-[1.1rem]" aria-hidden />
                      </span>
                      <span>
                        <span className={cn("block text-sm font-semibold", done ? "text-ink" : "text-muted")}>{ORDER_STATUS_LABEL[s]}</span>
                        <span className="block text-xs text-muted">{ev ? new Date(ev.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : done ? "" : "Pending"}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="items" className="rounded-[var(--radius-card)] border border-line bg-white">
            <h3 id="items" className="px-5 pt-5 text-xl font-semibold text-forest-900 sm:px-6">Items</h3>
            <ul className="mt-3 divide-y divide-line">
              {order.items.map((i) => (
                <li key={`${i.variantId}-${i.variantLabel}`} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                  <ProductImage src={i.imageUrl} alt="" sizes="56px" className="size-14 shrink-0 rounded-xl bg-sage-50" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{i.productName}</p>
                    <p className="text-sm text-muted">{i.variantLabel} · {i.quantity} × {formatINR(i.unitPrice)}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatINR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 text-[0.9375rem]">
            <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.1em] text-muted">Delivery</h3>
            <p className="mt-2 font-semibold text-ink">{formatDeliveryDate(order.deliveryDate)}</p>
            <p className="text-ink-soft">{order.slotLabel.replace(/(\d{2}:\d{2})/g, (t) => formatSlotTime(t))}</p>
            <p className="mt-3 font-medium text-ink">{order.address.fullName}{order.address.phone ? ` · ${order.address.phone}` : ""}</p>
            <p className="text-muted">{[order.address.line1, order.address.line2, order.address.landmark, order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(", ")}</p>
            {order.customerNote ? <p className="mt-3 rounded-xl bg-sage-50 p-3 text-sm text-ink-soft">“{order.customerNote}”</p> : null}
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 text-[0.9375rem]">
            <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.1em] text-muted">Payment</h3>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between"><dt className="text-ink-soft">Items</dt><dd className="tabular-nums">{formatINR(order.subtotal)}</dd></div>
              {order.discount > 0 ? <div className="flex justify-between"><dt className="text-ink-soft">Discount ({order.couponCode})</dt><dd className="tabular-nums text-leaf-600">−{formatINR(order.discount)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd className="tabular-nums">{order.deliveryFee ? formatINR(order.deliveryFee) : "Free"}</dd></div>
              <div className="flex justify-between border-t border-dashed border-line pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(order.total)}</dd></div>
            </dl>
            <p className="mt-3 text-sm text-muted">{order.paymentMethod === "cod"
                ? order.paymentStatus === "cod_pending"
                  ? `Cash on delivery · pay ${formatINR(order.total)} when it arrives`
                  : `Cash on delivery · ${PAYMENT_STATUS_LABEL[order.paymentStatus]}`
                : `${PAYMENT_METHOD_LABEL[order.paymentMethod]} · ${PAYMENT_STATUS_LABEL[order.paymentStatus]}`}</p>
          </section>
          <div className="flex flex-col gap-2.5">
            {mode === "account" ? <Button variant="lime" loading={busy === "reorder"} onClick={reorder}><RotateCcw className="size-4" aria-hidden /> Reorder these items</Button> : null}
            {mode === "account" && canCustomerCancel(order.status) ? <Button variant="danger" loading={busy === "cancel"} onClick={cancel}>Cancel order</Button> : null}
            <Link href="/contact" className="text-center text-sm text-muted underline-offset-4 hover:underline">Need help with this order?</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
