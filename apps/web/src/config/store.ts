import { normalizeWhatsAppNumber } from "@freshbasket/shared";

/**
 * Public, build-time store configuration (safe for the browser — no secrets here).
 * NEXT_PUBLIC_* values are baked in at build time: redeploy after changing them on Vercel.
 * Everything that changes day to day (store name, contact details, delivery fees,
 * minimum order, coupons, products) is managed in Admin instead.
 */
export const storeConfig = {
  /** Seller WhatsApp number in international format without +, spaces or hyphens, e.g. 919876543210. */
  whatsappNumber: normalizeWhatsAppNumber(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
  serviceArea: process.env.NEXT_PUBLIC_SERVICE_AREA?.trim() || "Faridabad & nearby areas",
  defaultCity: process.env.NEXT_PUBLIC_DEFAULT_CITY?.trim() || "Faridabad",
  defaultState: process.env.NEXT_PUBLIC_DEFAULT_STATE?.trim() || "Haryana",
  // Falls back to the Vercel production domain (a Vercel system variable) before localhost, so a deployment
  // without NEXT_PUBLIC_SITE_URL doesn't publish canonical links, sitemap and robots.txt pointing at localhost.
  siteUrl: (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/+$/, ""),
  secondaryTagline: "Fresh From Farm To Your Home",
  themeColor: "#0b6623",
  backgroundColor: "#fcfbf7",
};

/**
 * The WhatsApp number to use: the one saved in Admin → Settings (a 10-digit Indian mobile gets the 91
 * country code), or else NEXT_PUBLIC_WHATSAPP_NUMBER as a fallback — so a number changed in the admin
 * panel always takes effect.
 */
export function resolveWhatsAppNumber(adminWhatsapp: string | null | undefined): string | null {
  return normalizeWhatsAppNumber(adminWhatsapp) ?? storeConfig.whatsappNumber;
}
