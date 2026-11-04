# Performance & SEO Report — 4 Nov 2026

## 1. What was measured (and what wasn't)

| Measurement | Status |
| --- | --- |
| Local production build (`next build` + `next start`, local Postgres with the real migrations), headless Chromium at 390×844 mobile viewport, **no CPU/network throttling** | **RUN** — numbers below |
| Live Core Web Vitals (CrUX / PageSpeed Insights / throttled Lighthouse against production) | **NOT RUN** — the sandbox can't reach the live site directly; Lighthouse isn't installed. Owner: run https://pagespeed.web.dev on the live URL (Mobile) |
| Live TTFB | previous audit (28 Oct): 0.3 s warm / 2.2 s cold start |

### Local results (production build, unthrottled, so LCP is optimistic — use for *weights*, not absolute timing)

| Page | TTFB | LCP | CLS | JS (compressed) | CSS | Images | Fonts | Requests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 65 ms | 700 ms | 0 | 296 KB | 18 KB | 200 KB | 181 KB | 59 |
| `/shop` | 45 ms | 524 ms | 0 | 279 KB | 18 KB | 43 KB | 181 KB | 62 |
| `/product/onion` | 46 ms | 540 ms | 0 | 299 KB | 18 KB | 20 KB | 179 KB | 39 |
| `/cart` | 30 ms | 480 ms | 0 | 294 KB | 18 KB | 11 KB | 98 KB | 31 |

**CLS 0 on every page** (skeletons reserve space; images have sizes). On a mid-range Android phone over 4G, ~290 KB of
compressed JS (≈1 MB parsed) and ~180 KB of fonts are the main LCP/INP costs.

## 2. Server / database

| Item | Finding | Action |
| --- | --- | --- |
| Function region | `iad1` (US East) for Indian customers | FB-12: set `bom1` if the DB is in Mumbai (owner checks the Supabase region first — see DOMAIN_SERVER_AUDIT §6). Expected saving: ~200 ms per DB round trip × several round trips per page |
| Connection pool | max 3 per instance, `attachDatabasePool`, idle 10 s | ✅ (PR #30 fixed the 3 Nov `EMAXCONN` incident; no recurrence) |
| Catalogue caching | `unstable_cache` with tags, invalidated after every catalogue/stock-changing API call; checkout always re-reads | ✅ |
| Queries | home page: one catalogue read for all rails; order details loaded sequentially on one client | ✅ |
| Indexes | **added** `order_items(product_id)`, `order_items(variant_id)`, `orders(coupon_id)` (FB-21); `stock_movements(product_id, created_at)`, `admin_audit_log(created_at)` for the new tables | ✅ |
| Cold starts | Hobby; 2.2 s cold TTFB measured 28 Oct | Pro + `bom1` region; keep the dependency graph of API routes small |
| Hold release | lazy (≤ 1/min/instance) + cron | adds one cheap function call to quote/delivery requests; fine |

## 3. Front-end recommendations (not changed — "no unnecessary visual redesign")

1. **Fonts (~180 KB):** four families are loaded on every page (Inter variable, Fraunces variable, Poppins 500/600/700,
   Caveat variable). Biggest single win: drop one family or use Poppins only for headings with `font-display: swap`
   (fontsource already uses swap) and preload only the hero weight. Needs a design decision.
2. **JavaScript (~290 KB compressed):** run `ANALYZE` (e.g. `@next/bundle-analyzer`) to find large client modules;
   `lucide-react` icons are tree-shaken per import ✅. Lazy-load the Razorpay checkout script only on `/pay` ✅ already.
3. **Images:** hero banners are WebP from `public/images/site` ✅; product images from Supabase Storage go through
   `next/image` remote patterns ✅. 16 products still use development photos (OPEN-04 from the previous audit) — owner
   must supply licensed photos; no images were replaced here because licensed product photos weren't available.
4. **PWA:** service worker caches static assets only; never pages/prices ✅.

## 4. SEO

| Check | Result |
| --- | --- |
| Titles/descriptions per page | ✅ (`generateMetadata`; product description includes real price "from ₹…") |
| Canonical | ✅ per page, from `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL`; ❌ duplicate host `fresh-basket-brown.vercel.app` (FB-09, EXTERNAL) |
| sitemap.xml | ✅ categories + products from the database, with images |
| robots.txt | ✅; `Host:` removed (FB-28) |
| Product schema | ✅ real prices, stock, currency INR; ratings only from published reviews (no fake ratings) |
| LocalBusiness schema | **added** `GroceryStore` + `WebSite`/`SearchAction` (FB-29) from Admin settings + active delivery areas; no phone (owner choice, PR #35), no invented hours/ratings/price range. Becomes richer once the owner fills Admin → Settings → address/email/social links |
| Open Graph / Twitter | ✅ 1200×630 image |
| Not-found status | `/no-such-page` → 404 ✅; `/product/<unknown>` and `/category/<unknown>` → **200 + noindex** (FB-26, OPEN) |
| Mobile-first / accessibility | previous audit: 9 widths × axe, 0 issues; iOS input zoom fixed (PR #31). Not re-run in full this round |

### FB-26 options (choose one later)
- **A — Proxy check:** look up the slug in `proxy.ts` against a cached slug list and rewrite unknown slugs to a 404.
  Cost: a DB query path in front of product pages (keep it cached; mind the pool limit).
- **B — Move the loading boundary:** delete `(shop)/loading.tsx`, `product/[slug]/loading.tsx`,
  `category/[slug]/loading.tsx`; check existence at the top of the page, wrap only slow sections in `<Suspense>`.
  Cost: no instant skeleton on client navigation to those pages.
- Status quo is acceptable for search engines (Next.js injects `noindex`; such URLs aren't in the sitemap).
