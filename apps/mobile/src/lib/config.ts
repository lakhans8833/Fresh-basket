/**
 * API base URL. Set EXPO_PUBLIC_API_URL in apps/mobile/.env
 *  - iOS simulator / web: http://localhost:3000
 *  - Android emulator:    http://10.0.2.2:3000
 *  - Physical phone:      http://<computer LAN IP>:3000
 */
/** The live store (same value as EXPO_PUBLIC_API_URL in eas.json's preview/production profiles). */
const PRODUCTION_API_URL = "https://fresh-basket-veg.vercel.app";
// A release build made without EXPO_PUBLIC_API_URL (local `expo run --variant release`, a new EAS profile
// without `env`, an OTA export) must not silently point at localhost — every request would fail with
// "offline" (Android release builds also block plain http). Only development builds fall back to localhost.
const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
export const API_URL = (fromEnv || (__DEV__ ? "http://localhost:3000" : PRODUCTION_API_URL)).replace(/\/+$/, "");
if (!__DEV__ && !API_URL.startsWith("https://")) {
  console.warn(`[config] EXPO_PUBLIC_API_URL is not https (${API_URL}); release builds need an https API.`);
}

/** Image URLs from the API may be relative ("/images/dev/tomato.jpg"). */
export function imageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|file:)/.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const HERO_IMAGE = `${API_URL}/images/site/hero-veg-basket.webp`;
export const APP_SCHEME = "freshbasket";
