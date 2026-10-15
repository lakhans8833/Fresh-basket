import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { PageBanner } from "@/components/layout/page-banner";
import { CheckoutSteps } from "@/components/cart/checkout-steps";
import { WhatsAppOrderView } from "@/components/cart/whatsapp-order-view";
import { bookingPaymentMethods } from "@/lib/bookings";

export const metadata: Metadata = { title: "Book on WhatsApp", robots: { index: false, follow: false } };

/**
 * WhatsApp booking: no account needed. The booking is saved on the server (Pending Confirmation),
 * then WhatsApp opens with the booking details; the shop confirms it in Admin → WhatsApp bookings.
 */
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
        paymentMethods={bookingPaymentMethods(settings)}
      />
    </>
  );
}
