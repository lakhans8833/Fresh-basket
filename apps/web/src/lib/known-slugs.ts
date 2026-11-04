/**
 * FB-26: which product / category slugs exist, kept in memory by the proxy so an unknown
 * /product/<slug> or /category/<slug> can answer a real HTTP 404 (the shop's loading skeleton starts
 * streaming a 200 before the page itself can call notFound()).
 *
 * - One load per ~60 s per server instance (the load itself hits a cached API, not the database each time).
 * - A slug not in the list re-checks at most once per 10 s, so a product added a moment ago isn't a 404.
 * - Fail open: if the list can't be loaded (or is too old because reloading keeps failing), the answer is
 *   "unknown" (null) and the page renders as before.
 * No server-only imports: this runs in the proxy and in unit tests.
 */
export type SlugKind = "product" | "category";
export type SlugList = { products: string[]; categories: string[] };

export function createSlugCache(
  load: () => Promise<SlugList>,
  { ttlMs = 60_000, missRefreshMs = 10_000, retryMs = 10_000, now = Date.now }: { ttlMs?: number; missRefreshMs?: number; retryMs?: number; now?: () => number } = {},
) {
  let data: { product: Set<string>; category: Set<string> } | null = null;
  let loadedAt = -Infinity;
  let failedAt = -Infinity;
  let inflight: Promise<void> | null = null;

  const refresh = () =>
    (inflight ??= load()
      .then((d) => {
        if (!Array.isArray(d?.products) || !Array.isArray(d?.categories)) throw new Error("bad slug list");
        data = { product: new Set(d.products), category: new Set(d.categories) };
        loadedAt = now();
      })
      .catch(() => {
        failedAt = now();
      })
      .finally(() => {
        inflight = null;
      }));
  const mayReload = () => now() - failedAt > retryMs;
  const fresh = () => data !== null && now() - loadedAt <= ttlMs;

  /** true = exists, false = definitely unknown (→ 404), null = can't tell (render the page). */
  return async function isKnown(kind: SlugKind, slug: string): Promise<boolean | null> {
    if (!fresh() && mayReload()) await refresh();
    if (!fresh()) return null;
    if (data![kind].has(slug)) return true;
    if (now() - loadedAt > missRefreshMs && mayReload()) {
      await refresh();
      if (!fresh()) return null;
      return data![kind].has(slug);
    }
    return false;
  };
}

/** /product/<slug> or /category/<slug> (one segment) → its kind and decoded slug; anything else → null. */
export function slugRoute(pathname: string): { kind: SlugKind; slug: string } | null {
  const m = /^\/(product|category)\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  try {
    return { kind: m[1] as SlugKind, slug: decodeURIComponent(m[2]!) };
  } catch {
    return null;
  }
}
