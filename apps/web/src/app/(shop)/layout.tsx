import { getSettings, supportedPaymentMethods } from "@/lib/settings";
import { listCategories } from "@/lib/catalog";
import { env } from "@/lib/env";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { SiteHeader, TopBar } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { WhatsAppFloat } from "@/components/layout/whatsapp-float";
import { storeBenefits } from "@/components/layout/benefits";
import { InstallBanner } from "@/components/layout/install-app";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [settings, categories] = await Promise.all([
    getSettings(),
    listCategories().catch((e) => {
      console.error("[layout] categories unavailable — see /api/health", e);
      return [];
    }),
  ]);
  const whatsapp = resolveWhatsAppNumber(settings.whatsapp);
  const devNotes = [
    env.auth.mode === "dev" && "development login",
    env.payments.online === "mock" && "test payments (no real money)",
  ].filter(Boolean);
  return (
    <div className="flex min-h-dvh flex-col bg-ivory pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      {devNotes.length ? (
        <div className="bg-[#fdf6e7] px-4 py-1 text-center text-xs font-medium text-[#7a5212]">
          Development mode: {devNotes.join(" · ")} · sample catalogue data
        </div>
      ) : null}
      <TopBar announcement={settings.announcement} serviceArea={storeConfig.serviceArea} />
      <SiteHeader settings={settings} />
      <InstallBanner storeName={settings.storeName} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter
        settings={settings}
        categories={categories}
        paymentMethods={supportedPaymentMethods(settings)}
        benefits={storeBenefits(settings, { whatsapp: Boolean(whatsapp), serviceArea: storeConfig.serviceArea })}
        serviceArea={storeConfig.serviceArea}
      />
      {whatsapp ? <WhatsAppFloat number={whatsapp} storeName={settings.storeName} /> : null}
      <MobileTabBar />
    </div>
  );
}
