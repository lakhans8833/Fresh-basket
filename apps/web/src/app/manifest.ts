import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@freshbasket/shared";
import { getSettings } from "@/lib/settings";
import { storeConfig } from "@/config/store";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  return {
    id: "/",
    name: s.storeName,
    // The same name as everywhere else (the home screen shortens it if it has to).
    short_name: s.storeName || BRAND_NAME,
    description: `${s.tagline || "Fresh vegetables"} — order online for delivery in ${storeConfig.serviceArea}.`,
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: storeConfig.themeColor,
    background_color: storeConfig.backgroundColor,
    lang: "en-IN",
    categories: ["food", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop now", url: "/shop", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My cart", url: "/cart", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
