# Fresh Basket — Audit Report (executive summary & architecture)

**Live:** https://fresh-basket-veg.vercel.app (primary) · https://fresh-basket-brown.vercel.app (same code, same database)
**Code:** `lakhans8833/fresh-basket`, `main` at the time of writing = PR #23 (`b8b3e45`) + this audit branch
**Date:** 28 Oct 2026 · **Method:** source inspection, automated tests on a local copy with the real migrations,
browser tests on a local production build, and **read-only** checks of the live site (no orders, payments,
accounts, messages or data changes in production).

Status words used in all reports: **PASS** (ran and passed), **FAIL** (ran and failed), **BLOCKED** (needs access or
information we don't have), **NOT RUN** (not executed, with the reason).

## 1. Executive summary

- The store's critical paths — server-side prices, stock reservation, duplicate-order protection, payments, order
  ownership and admin permissions — are implemented on the server/database and are covered by automated tests
  that were **run and passed** (223 unit/integration tests; 18 browser test suites; responsive + accessibility sweep at
  9 screen widths with 0 issues).
- Five rounds of audits between 21 and 28 Oct found and fixed **63 confirmed bugs** (see `BUG_REPORT.md`); none of
  them is open in the code today. Highest ones fixed: stock that could be sold 4× after an admin edit, unpaid
  orders blocking stock, an account pre-takeover path in the phone app's sign-up, coupons reusable after account
  deletion, filters invisible on phones.
- **No P0 issue is open.** What still blocks a real launch is **configuration and business data that only the owner
  can supply** (P1): customer contact details are empty on the live store, the sign-up email sends a link instead of a
  code and is limited to ~2 emails/hour, legal identity is empty, 16 products use development sample photos whose
  licence is unverified, and delivery-area data has errors. See `FIX_PLAN.md`.
- Live catalogue (55 products, 189 pack sizes) is internally consistent: every shown price, MRP, "% OFF" and ₹/kg
  matches the data (55/55 cards checked on the live shop page); 1 price needs the owner's confirmation
  (Organic Potato cheaper than regular Potato). See `PRICE_CATALOG_AUDIT.csv`.

## 2. Architecture (discovered from the repository)

| Part | Technology | Where |
| --- | --- | --- |
| Website + API | Next.js 16.4 (App Router, React 19), TypeScript, Tailwind CSS 4 | `apps/web` |
| Phone app | Expo SDK 57 / React Native (Expo Router), same API | `apps/mobile` |
| Shared logic | Pricing, stock-by-weight, slots, PIN codes, zod schemas, search | `packages/shared` |
| Database | PostgreSQL (Supabase). 34 SQL migrations: schema, RLS on every table, order/payment functions (`security definer`, fixed `search_path`), storage policies, rate-limit table | `supabase/migrations` |
| Auth | Supabase Auth (email + password, email code, optional Google). A dev-only login exists for local work and is disabled on Vercel production | `apps/web/src/lib/auth.ts`, `env.ts` |
| Payments | Cash on delivery (live). Razorpay online payment, UPI (staff-verified) and Razorpay payment links are implemented but **not enabled** on the live store | `apps/web/src/lib/payments/*` |
| Notifications | WhatsApp Cloud API order updates (not configured live); SMTP email codes (optional) | `lib/notify/*`, `lib/auth-email.ts` |
| Hosting | Vercel, two projects (`fresh-basket`, `fresh-basket-veg`) from one repo; migrations run automatically in the production build (`scripts/migrate.mjs`) | `apps/web/package.json` |
| Cron | `/api/cron/release-expired` (daily) — returns 401 until `CRON_SECRET` is set; holds are also released on shopper requests (once a minute) | `apps/web/vercel.json` |

**Order journey:** product list (`/api/products`, cached) → cart in the browser (`localStorage`) → server quote
(`/api/quote`: prices, stock, coupon, PIN-code area, fee, minimum — never from the client) → checkout
(`placeOrder`: one transaction, locks stock rows, re-quotes, idempotency key, duplicate fingerprint, slot capacity) →
COD / payment → admin status flow (placed → packed → out for delivery → delivered / cancelled, with stock return)
→ customer order page and tracking link.

**Real vs sample:** the sample catalogue in `supabase/seed.sql` (prices, stock, Bengaluru PIN codes, coupons) is
for development. The live store uses its own data (Faridabad PIN codes only — verified), but **16 live products
still use photos from `public/images/dev/`**, which the repository marks as development images of unverified origin.

## 3. Areas reviewed and results

| Area | Result | Details |
| --- | --- | --- |
| Frontend routes (shop, product, cart, checkout, account, orders, tracking, policies, admin) | PASS | 76 live pages return 200 with no error pages; 9 widths (320–1920 px) with axe: 0 issues; 12 frontend bugs found in round 4 fixed |
| Catalogue & prices | PASS with 1 owner question | `PRICE_CATALOG_AUDIT.csv` |
| Cart & checkout | PASS | free-delivery boundary ₹498/₹499/₹500 (121001) and ₹598/₹599 (121005) checked on the live quote API |
| Backend & database | PASS | transactions, row locks, idempotency, constraints, RLS — `TEST_PLAN.md` |
| Security | No open P0/P1 in code | `SECURITY_REPORT.md` |
| Performance | PARTIAL | desktop measured (live): TTFB 0.3 s warm / 2.2 s cold start, LCP 1.6 s; phone Core Web Vitals NOT RUN (no throttled run against live possible from here) |
| SEO | PASS with 1 owner action | sitemap, robots, canonical, product JSON-LD present; two domains both canonical to themselves (owner to point `NEXT_PUBLIC_APP_URL` of the second project at the primary) |
| Deployment | PASS | both Vercel projects deploy each merge; migrations applied in build |

## 4. Limitations of this audit

- The live Supabase project is not in our Supabase access, so **live database policies were not inspected directly**;
  they were verified from the migrations (which the build applies) and tested on a local database (BLOCKED for live).
- Live Supabase Auth email delivery, Google sign-in, Razorpay and WhatsApp sending were not exercised (not configured
  live / would contact real people).
- Phone app: tested as a web export in a browser; no Android/iOS release build was made here (Expo/Google build
  servers are not reachable from this environment).
- Vercel environment variables could not be read (access returns 403); production config was checked from behaviour
  (no development banner, Supabase auth mode, dev login refused).

## 5. Deliverables

`BUG_REPORT.md` · `SECURITY_REPORT.md` · `TEST_PLAN.md` · `PRICE_CATALOG_AUDIT.csv` · `FIX_PLAN.md`
