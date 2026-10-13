import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrderById } from "@/lib/orders";
import { payToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { preparePayment } from "@/lib/payments/start";
import { getSettings } from "@/lib/settings";
import { PayPanel } from "@/components/cart/pay-panel";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { Lock } from "lucide-react";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

/** Hosted payment page. Opened from checkout (web) or from the mobile app with a signed token. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; return?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getOrderById(id);
  const session = await getSession();
  const allowed = order && (session?.userId === order.userId || payToken.verify(order.id, sp.t));
  if (!order || !allowed) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<Lock className="size-7" />} title="This payment link isn't valid" action={<ButtonLink href="/account/orders">Your orders</ButtonLink>}>
          The link may have expired. Open the order from your account to try again.
        </EmptyState>
      </div>
    );
  }
  const payment = order.status === "pending_payment" ? await preparePayment(order).catch(() => undefined) : undefined;
  const settings = await getSettings();
  return (
    <PayPanel
      order={{ id: order.id, orderNumber: order.orderNumber, total: order.total, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, expiresAt: order.reservationExpiresAt, name: order.address.fullName, phone: order.address.phone }}
      payment={payment ?? null}
      token={sp.t ?? null}
      returnToApp={sp.return === "app"}
      storeName={settings.storeName}
      mode={env.payments.online}
    />
  );
}
