import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { CartView } from "@/components/cart/cart-view";
import { PageBanner } from "@/components/layout/page-banner";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default async function CartPage() {
  const settings = await getSettings();
  return (
    <>
      <PageBanner
        title="Your Shopping Cart"
        subtitle="Fresh vegetables, better health!"
        icon={<ShoppingCart className="size-14" strokeWidth={2.2} />}
        image="/images/site/banner-market.webp"
        script={storeConfig.secondaryTagline}
      />
      <CartView whatsappEnabled={Boolean(resolveWhatsAppNumber(settings.whatsapp))} />
    </>
  );
}
