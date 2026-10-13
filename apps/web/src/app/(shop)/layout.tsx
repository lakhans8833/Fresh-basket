import { getSettings, supportedPaymentMethods } from "@/lib/settings";
import { listCategories } from "@/lib/catalog";
import { env } from "@/lib/env";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [settings, categories] = await Promise.all([
    getSettings(),
    listCategories().catch((e) => {
      console.error("[layout] categories unavailable — see /api/health", e);
      return [];
    }),
  ]);
  const devNotes = [
    env.auth.mode === "dev" && "development login",
    env.payments.online === "mock" && "test payments (no real money)",
  ].filter(Boolean);
  return (
    <div className="flex min-h-dvh flex-col pb-16 md:pb-0">
      {devNotes.length ? (
        <div className="bg-[#fdf6e7] px-4 py-1 text-center text-xs font-medium text-[#7a5212]">
          Development mode: {devNotes.join(" · ")} · sample catalogue data
        </div>
      ) : null}
      <SiteHeader settings={settings} categories={categories} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter settings={settings} categories={categories} paymentMethods={supportedPaymentMethods(settings)} />
      <MobileTabBar />
    </div>
  );
}
