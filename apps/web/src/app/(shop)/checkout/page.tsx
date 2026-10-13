import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings, supportedPaymentMethods } from "@/lib/settings";
import { CheckoutView } from "@/components/cart/checkout-view";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/checkout");
  const methods = supportedPaymentMethods(await getSettings());
  return <CheckoutView paymentMethods={methods} />;
}
