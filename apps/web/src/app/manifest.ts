import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { storeConfig } from "@/config/store";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  return {
    id: "/",
    name: s.storeName,
    short_name: s.storeName.split(" ").slice(-2).join(" ").slice(0, 12) || "Fresh Basket",
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
      { name: "Shop vegetables", url: "/shop", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My cart", url: "/cart", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
