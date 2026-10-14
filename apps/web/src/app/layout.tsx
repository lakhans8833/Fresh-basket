import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource-variable/caveat";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { CartProvider } from "@/components/cart/cart-context";
import { SessionProvider } from "@/components/account/session-context";
import { AutoLocation } from "@/components/layout/auto-location";
import { ToastProvider } from "@/components/ui/toast";
import { PwaRegister } from "@/components/layout/pwa-register";
import { storeConfig } from "@/config/store";

// Prices, stock and settings are live data: render on every request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const description = `${s.tagline ? `${s.tagline}. ` : ""}Order fresh fruits and vegetables online for home delivery in ${storeConfig.serviceArea}.`;
  return {
    metadataBase: new URL(storeConfig.siteUrl),
    title: { default: `${s.storeName} — Fresh fruits & vegetables delivered in ${storeConfig.defaultCity}`, template: `%s | ${s.storeName}` },
    description,
    applicationName: s.storeName,
    openGraph: {
      type: "website",
      siteName: s.storeName,
      locale: "en_IN",
      title: s.storeName,
      description,
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: `${s.storeName} — fresh vegetables` }],
    },
    twitter: { card: "summary_large_image", title: s.storeName, description, images: ["/og-image.jpg"] },
    appleWebApp: { capable: true, title: s.storeName.split(" ").slice(-2).join(" "), statusBarStyle: "default" },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: storeConfig.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null);
  return (
    <html lang="en-IN">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only z-50 rounded-full bg-forest-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <SessionProvider initial={session?.profile ?? null}>
          <CartProvider>
            <ToastProvider>
              {children}
              <AutoLocation />
            </ToastProvider>
          </CartProvider>
        </SessionProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
