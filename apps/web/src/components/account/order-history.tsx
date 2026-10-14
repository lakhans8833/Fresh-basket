"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CalendarClock, CreditCard, Package, RotateCcw } from "lucide-react";
import {
  formatINR, formatSlotTime, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL,
  type Order, type PlaceOrderResponse,
} from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { useCart } from "../cart/cart-context";
import { useToast } from "../ui/toast";
import { Button, ButtonLink } from "../ui/button";
import { EmptyState, Notice } from "../ui/feedback";
import { ProductImage } from "../product/product-image";
import { cn } from "../ui/cn";
import { formatDeliveryDate, statusTone } from "./order-detail";

const MAX_THUMBS = 5;

export function OrderHistory({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const { add, lines } = useCart();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!orders.length) {
    return (
      <div className="mt-5">
        <EmptyState icon={<Package className="size-7" />} title="No orders yet" action={<ButtonLink href="/shop" variant="dark">Start shopping</ButtonLink>}>
          When you place an order it will show up here, so you can track it and reorder in a tap.
        </EmptyState>
      </div>
    );
  }

  async function reorder(order: Order) {
    setBusy(`reorder:${order.id}`);
    setError(null);
    try {
      const r = await api<{ items: { variantId: string; quantity: number; productSlug: string }[]; skipped: string[] }>(`/api/orders/${order.id}/reorder`, { method: "POST" });
      if (!r.items.length) {
        toast("None of these items are available right now", "error");
        setBusy(null);
        return;
      }
      for (const it of r.items) {
        const src = order.items.find((i) => i.variantId === it.variantId);
        if (!src) continue;
        const existing = lines.find((l) => l.variantId === it.variantId)?.quantity ?? 0;
        if (it.quantity > existing) {
          add({ variantId: it.variantId, productName: src.productName, productSlug: it.productSlug, variantLabel: src.variantLabel, imageUrl: src.imageUrl, priceHint: src.unitPrice }, it.quantity - existing);
        }
      }
      toast(r.skipped.length ? `Added ${r.items.length} item${r.items.length === 1 ? "" : "s"}. Not available: ${r.skipped.join(", ")}` : "Items added to your cart");
      router.push("/cart");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function pay(order: Order) {
    setBusy(`pay:${order.id}`);
    setError(null);
    try {
      const r = await api<PlaceOrderResponse>(`/api/orders/${order.id}/pay`, { method: "POST" });
      if (!r.payment?.payUrl) throw new Error("This order no longer needs payment.");
      const u = new URL(r.payment.payUrl, window.location.origin);
      router.push(`${u.pathname}${u.search}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <>
      {error ? <Notice tone="error" className="mt-5">{error}</Notice> : null}
      <ul className="mt-5 space-y-4">
        {orders.map((o) => {
          const count = o.items.reduce((s, i) => s + i.quantity, 0);
          const extra = o.items.length - MAX_THUMBS;
          const slot = o.slotLabel.replace(/(\d{2}:\d{2})/g, (t) => formatSlotTime(t));
          return (
            <li key={o.id}>
              <article aria-labelledby={`order-${o.id}`} className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id={`order-${o.id}`} className="font-sans text-base font-semibold text-ink">
                      <Link href={`/orders/${o.id}`} className="hover:text-leaf-600">Order {o.orderNumber}</Link>
                    </h2>
                    <p className="text-sm text-muted">
                      Placed {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusTone(o.status))}>{ORDER_STATUS_LABEL[o.status]}</span>
                    <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">{PAYMENT_STATUS_LABEL[o.paymentStatus]}</span>
                  </div>
                </div>

                <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-leaf-600" aria-hidden />
                  <span>{o.status === "delivered" ? "Delivered for" : o.status === "cancelled" ? "Was due" : "Delivery"} {formatDeliveryDate(o.deliveryDate)} · {slot}</span>
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <ul className="flex -space-x-2" aria-label={`${o.items.length} product${o.items.length === 1 ? "" : "s"}`}>
                    {o.items.slice(0, MAX_THUMBS).map((i) => (
                      <li key={`${i.variantId}-${i.variantLabel}`} title={`${i.productName} (${i.variantLabel}) × ${i.quantity}`}>
                        <ProductImage src={i.imageUrl} alt={i.productName} sizes="48px" className="size-12 rounded-xl bg-sage-50 ring-2 ring-white [&_span]:hidden [&_svg]:size-6" />
                      </li>
                    ))}
                    {extra > 0 ? (
                      <li className="grid size-12 place-items-center rounded-xl bg-sage-100 text-sm font-semibold text-forest-800 ring-2 ring-white">+{extra}</li>
                    ) : null}
                  </ul>
                  <p className="text-sm text-muted">{count} item{count === 1 ? "" : "s"}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-4">
                  <p className="text-sm text-muted">Total <span className="ml-1 text-lg font-semibold tabular-nums text-ink">{formatINR(o.total)}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {o.status === "pending_payment" ? (
                      <Button size="sm" variant="dark" loading={busy === `pay:${o.id}`} disabled={!!busy} onClick={() => pay(o)}>
                        <CreditCard className="size-4" aria-hidden /> Complete payment
                      </Button>
                    ) : null}
                    <Button size="sm" variant="lime" loading={busy === `reorder:${o.id}`} disabled={!!busy} onClick={() => reorder(o)} aria-label={`Reorder items from order ${o.orderNumber}`}>
                      <RotateCcw className="size-4" aria-hidden /> Reorder
                    </Button>
                    <ButtonLink href={`/orders/${o.id}`} size="sm" variant="outline" aria-label={`View or track order ${o.orderNumber}`}>
                      View / track <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
