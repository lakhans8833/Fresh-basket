import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { PageBanner } from "@/components/layout/page-banner";
import { CheckoutSteps } from "@/components/cart/checkout-steps";
import { WhatsAppOrderView } from "@/components/cart/whatsapp-order-view";

export const metadata: Metadata = { title: "Order on WhatsApp", robots: { index: false, follow: false } };

/** WhatsApp checkout: no account needed. The customer sends the order from their own WhatsApp. */
export default async function WhatsAppOrderPage() {
  const settings = await getSettings();
  return (
    <>
      <PageBanner title="Order on WhatsApp" as="h1" image="/images/site/banner-roots.webp" script={storeConfig.secondaryTagline} className="[&_h1]:sr-only">
        <CheckoutSteps current={2} />
      </PageBanner>
      <WhatsAppOrderView
        whatsappNumber={resolveWhatsAppNumber(settings.whatsapp)}
        storeName={settings.storeName}
        defaultCity={storeConfig.defaultCity}
      />
    </>
  );
}
