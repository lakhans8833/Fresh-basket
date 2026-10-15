import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Shared server cache for public catalogue data (products, categories, settings), so shop pages
 * don't query the database on every visit. Entries are dropped as soon as anything that can change
 * them succeeds (see invalidateAfter, called by every API route), and expire after a few minutes anyway.
 * Checkout never trusts this cache: prices and stock are re-read from the database (lib/quote.ts).
 */
export const CACHE_TAGS = { catalog: "catalog", settings: "settings" } as const;

export function cached<A extends unknown[], R>(key: string, tags: string[], revalidateSeconds: number, fn: (...a: A) => Promise<R>): (...a: A) => Promise<R> {
  // Outside the Next.js server (tests, scripts) there is no cache store: call straight through.
  if (!process.env.NEXT_RUNTIME) return fn;
  return unstable_cache(fn, [key], { tags, revalidate: revalidateSeconds });
}

export function invalidate(...tags: string[]) {
  for (const t of tags) {
    try {
      revalidateTag(t, { expire: 0 });
    } catch {
      /* not inside a Next.js request (tests, scripts) */
    }
  }
}

// Requests that never change products, stock, categories or settings.
const NO_CATALOG_CHANGE = ["/api/auth/", "/api/me", "/api/newsletter", "/api/contact", "/api/quote", "/api/search/", "/api/delivery/check", "/api/admin/upload", "/api/admin/messages", "/api/admin/users", "/api/bookings"];

/**
 * After a successful API request that may have changed stock or the catalogue (orders, cancellations,
 * payments, expiry cron, any Admin edit), drop the cached catalogue so shoppers see it right away.
 */
export function invalidateAfter(req: Request, status: number) {
  if (status >= 400) return;
  const path = new URL(req.url).pathname;
  const mutating = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (!(mutating || path.startsWith("/api/cron/"))) return;
  if (NO_CATALOG_CHANGE.some((p) => path.startsWith(p))) return;
  invalidate(CACHE_TAGS.catalog);
  if (path.startsWith("/api/admin/settings")) invalidate(CACHE_TAGS.settings);
}
