"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditCard, FlaskConical, Lock, Timer, CheckCircle2, XCircle } from "lucide-react";
import { formatINR, type PlaceOrderResponse, type OrderStatus, type PaymentStatus, type PaymentMethod } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Button, ButtonLink } from "../ui/button";
import { DevBadge, Notice } from "../ui/feedback";

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

interface Props {
  order: { id: string; orderNumber: string; total: number; status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod: PaymentMethod; expiresAt: string | null; name: string; phone: string };
  payment: PlaceOrderResponse["payment"] | null;
  token: string | null;
  returnToApp: boolean;
  storeName: string;
  mode: "razorpay" | "mock" | null;
}

function useCountdown(iso: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return;
    const tick = () => setLeft(Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return left;
}

export function PayPanel({ order, payment, token, returnToApp, storeName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"paid" | "pending" | null>(null);
  const [attention, setAttention] = useState<string | null>(null);
  const left = useCountdown(order.expiresAt);
  const q = token ? `?t=${encodeURIComponent(token)}` : "";

  const finish = (state: "paid" | "pending") => {
    setDone(state);
    setTimeout(() => {
      if (returnToApp) window.location.href = `freshbasket://orders/${order.id}`;
      else router.push(`/orders/${order.id}?placed=1`);
    }, 900);
  };

  async function payRazorpay() {
    if (!payment || payment.provider !== "razorpay" || !window.Razorpay) {
      setError("The payment window couldn't load. Check your connection and try again.");
      return;
    }
    setError(null);
    setBusy("rzp");
    const rzp = new window.Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amount,
      currency: "INR",
      name: storeName,
      description: `Order ${order.orderNumber}`,
      prefill: { name: order.name, contact: order.phone },
      theme: { color: "#1b3d28" },
      modal: { ondismiss: () => setBusy(null) },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          const r = await api<{ status: string }>(`/api/payments/razorpay/verify${q}`, { method: "POST", json: { orderId: order.id, ...resp } });
          if (["paid", "paid_late", "already_processed"].includes(r.status)) finish("paid");
          else if (r.status === "pending_confirmation") finish("pending");
          else {
            // refund_required / amount_mismatch: never show "Payment confirmed" for these — and stay on
            // this screen so the customer can read what happens next.
            setBusy(null);
            setAttention(
              r.status === "refund_required"
                ? "We received your payment, but this order can no longer be completed. Your refund will be processed — see the order page."
                : "We couldn't confirm this payment automatically. Our team will check it — see the order page.",
            );
          }
        } catch (e) {
          // The webhook will still confirm a genuine payment; point the customer to the order page.
          setBusy(null);
          setAttention(`${(e as Error).message} If money was taken, your order page will update shortly.`);
        }
      },
    });
    rzp.on("payment.failed", () => {
      setBusy(null);
      setError("Payment failed or was declined. No money was taken — you can try again.");
    });
    rzp.open();
  }

  async function simulate(outcome: "success" | "failure") {
    setError(null);
    setBusy(outcome);
    try {
      const r = await api<{ status: string }>(`/api/payments/mock/complete${q}`, { method: "POST", json: { orderId: order.id, outcome } });
      if (outcome === "success" && ["paid", "already_processed", "paid_late"].includes(r.status)) finish("paid");
      else {
        setError(outcome === "failure" ? "Simulated a failed payment. The order is still waiting for payment." : `Payment result: ${r.status.replaceAll("_", " ")}`);
        setBusy(null);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const awaiting = order.status === "pending_payment" && order.paymentStatus === "pending";
  const expired = left === 0;

  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      {payment?.provider === "razorpay" ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" /> : null}
      <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
        {attention ? (
          <div className="py-6" role="alert">
            <XCircle className="mx-auto size-14 text-amber" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold text-forest-900">About your payment</h1>
            <p className="mt-3 text-ink-soft">{attention}</p>
            <ButtonLink href={returnToApp ? `freshbasket://orders/${order.id}` : `/orders/${order.id}`} variant="dark" className="mt-6">View order</ButtonLink>
          </div>
        ) : done ? (
          <div className="py-6" role="status">
            <CheckCircle2 className="mx-auto size-14 text-leaf-500" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold text-forest-900">{done === "paid" ? "Payment confirmed" : "Confirming your payment…"}</h1>
            <p className="mt-2 text-muted">Taking you to your order…</p>
          </div>
        ) : !awaiting ? (
          <div className="py-6">
            {order.paymentStatus === "paid" ? <CheckCircle2 className="mx-auto size-14 text-leaf-500" aria-hidden /> : <XCircle className="mx-auto size-14 text-muted" aria-hidden />}
            <h1 className="mt-4 text-2xl font-semibold text-forest-900">{order.paymentStatus === "paid" ? "This order is already paid" : "This order is no longer awaiting payment"}</h1>
            <ButtonLink href={returnToApp ? `freshbasket://orders/${order.id}` : `/orders/${order.id}`} variant="dark" className="mt-6">View order</ButtonLink>
          </div>
        ) : (
          <>
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-lime-100 text-forest-800">
              {payment?.provider === "mock" ? <FlaskConical className="size-6" aria-hidden /> : <Lock className="size-6" aria-hidden />}
            </span>
            <p className="eyebrow mt-4">Order {order.orderNumber}</p>
            <h1 className="mt-1 text-[1.75rem] font-semibold text-forest-900">Complete your payment</h1>
            <p className="mt-3 font-display text-4xl font-semibold tabular-nums text-forest-900">{formatINR(order.total)}</p>
            {left !== null ? (
              <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${expired ? "bg-danger-bg text-danger" : "bg-sage-100 text-ink-soft"}`} aria-live="polite">
                <Timer className="size-4" aria-hidden />
                {expired ? "Time's up — items released" : `Items held for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
              </p>
            ) : null}
            {error ? <Notice tone="error" className="mt-5 text-left">{error}</Notice> : null}
            <div className="mt-6 space-y-3">
              {payment?.provider === "razorpay" ? (
                <Button variant="dark" size="lg" className="w-full" loading={busy === "rzp"} disabled={expired} onClick={payRazorpay}>
                  <CreditCard className="size-5" aria-hidden /> Pay {formatINR(order.total)}
                </Button>
              ) : payment?.provider === "mock" ? (
                <>
                  <Notice tone="warning" className="text-left" title="Test payment — no real money">
                    Razorpay isn&apos;t configured. These buttons simulate the gateway&apos;s webhook through the same server-side code as a real payment.
                  </Notice>
                  <Button variant="dark" size="lg" className="w-full" loading={busy === "success"} disabled={!!busy || expired} onClick={() => simulate("success")}>
                    Simulate successful payment
                  </Button>
                  <Button variant="outline" size="lg" className="w-full" loading={busy === "failure"} disabled={!!busy || expired} onClick={() => simulate("failure")}>
                    Simulate failed payment
                  </Button>
                  <DevBadge />
                </>
              ) : (
                <Notice tone="error">Online payment isn&apos;t available right now. Please cancel this order and choose cash on delivery.</Notice>
              )}
              <ButtonLink href={returnToApp ? `freshbasket://orders/${order.id}` : `/orders/${order.id}`} variant="ghost" className="w-full">
                Pay later / view order
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
