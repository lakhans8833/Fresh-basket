import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { CartProvider } from "@/components/cart/cart-context";
import { SessionProvider } from "@/components/account/session-context";
import { ToastProvider } from "@/components/ui/toast";

// Prices, stock and settings are live data: render on every request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: `${s.storeName} — fresh vegetables delivered`, template: `%s · ${s.storeName}` },
    description: s.tagline || "Order fresh vegetables online for doorstep delivery.",
    applicationName: s.storeName,
  };
}

export const viewport: Viewport = {
  themeColor: "#14301f",
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
            <ToastProvider>{children}</ToastProvider>
          </CartProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
