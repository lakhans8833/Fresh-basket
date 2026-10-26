/**
 * API base URL. Set EXPO_PUBLIC_API_URL in apps/mobile/.env
 *  - iOS simulator / web: http://localhost:3000
 *  - Android emulator:    http://10.0.2.2:3000
 *  - Physical phone:      http://<computer LAN IP>:3000
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Image URLs from the API may be relative ("/images/dev/tomato.jpg"). */
export function imageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|file:)/.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const HERO_IMAGE = `${API_URL}/images/site/hero-veg-basket.webp`;
export const APP_SCHEME = "freshbasket";
