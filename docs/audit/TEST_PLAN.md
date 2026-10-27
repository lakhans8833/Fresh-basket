# Test Plan & Execution Status

**Final run:** 28 Oct 2026, 03:26 IST, branch `audit/report-and-deps` (= `main` PR #23 + audit fixes), local
production build with the real migrations on a throwaway Postgres database; live checks read-only.
Status: **PASS** ran and passed · **FAIL** ran and failed · **BLOCKED** needs access/data · **NOT RUN** (reason given).

## 1. Prerequisites

- Node 22 + npm workspaces (`npm ci`), PostgreSQL 16 locally (`scripts/local-db.sh` builds `freshbasket` /
  `freshbasket_test` from `supabase/migrations` + `seed.sql`).
- Web unit/integration: `cd apps/web && npx vitest run` (resets `freshbasket_test`). Shared: `cd packages/shared && npx vitest run`.
- Browser tests: production build (`npx next build`, `next start -p 3200`, dev login on, test payments), Python Playwright + Chromium.
- Phone app: `npx expo export --platform web` served on :8081 against the same API.
- Live checks: Chrome, public endpoints only.

## 2. Automated suites — results of the final run

| Suite | What it covers | Result |
| --- | --- | --- |
| ESLint, TypeScript (web, shared, app) | static checks | PASS |
| Web unit + integration (`apps/web/test`, 24 files) | pricing/quote, orders (idempotency, overselling, coupons, slots, expiry), payments (Razorpay HTTP, UPI, late/duplicate), RLS isolation (2 customers + anon), admin permissions, auth (email codes, OTP errors, callbacks, session refresh), account deletion, rate limits, analytics, deep-check regressions | **PASS 216/216** |
| Shared unit (`packages/shared/test`) | money, PIN codes, pricing, stock by weight, search (incl. plurals/typos), home rows, UPI, WhatsApp text | **PASS 52/52** |
| Production build (`next build`) | compiles all routes | PASS |
| `e2e/qa_plan.py` | 94 storefront/admin checks | PASS (89 pass, 0 fail, 5 info) |
| `e2e/store_improvements.py` | store features | PASS 37/37 |
| `e2e/flow.py` | search → product → cart → coupon → checkout → COD order → test online payment | PASS |
| `e2e/checkout_retry.py` | network failure / retry keeps one order | PASS |
| Customer page sweep 390 px / 1366 px | console errors, failed requests, broken images on 15 pages each | PASS (15/15, 15/15) |
| Admin page sweep 390 px / 1280 px | same for admin | PASS (only expected 409 when deleting a category that has products) |
| Product cards 1920 px | 60 cards before/after adding to cart | PASS (0 bad) |
| Responsive + axe (320, 360, 375, 390, 768, 1024, 1366, 1440, 1920 px) | overflow, overlap, tap targets, accessibility rules | PASS (333 checks, 0 issues) |
| Keyboard | focus order and visibility | PASS 12/12 |
| `e2e/shopper_features.py` | next slot, cart bar, search examples, pack notes | PASS 19/19 |
| `e2e/admin_hydration.py` / `e2e/admin_charts.py` | admin dashboard | PASS 5/5, 17/17 |
| Race + API permission matrix | concurrent orders; 31 routes × anon/customer/staff/admin | PASS (`FAILS []`; 1 expected 503: set-password needs Supabase Auth) |
| `e2e/policy_pages.py` | no placeholders, legal settings shown, CSP header, no CSP errors | PASS 35/35 |
| `e2e/deep_check_4.py` | phone filter menus, drawer focus, toast vs cart bar, print, short screens | PASS 6/6 |
| `apps/mobile/e2e/smoke.py` | app home, cards, stepper, basket bar, categories, product, buy again, orders | PASS 13/13 |
| `apps/mobile/e2e/auth_mock.py` | app email code, sign-up code, password reset of earlier sign-up, Google button | PASS 13/13 |
| `npm audit` | web production deps 0; app 6 (Expo tooling) | PASS (web) / see `SECURITY_REPORT.md` S-11 |

## 3. Manual / live test cases

| ID | Case | Expected | Result |
| --- | --- | --- | --- |
| L-01 | All 76 sitemap URLs on the live primary domain | 200, no error page, no placeholders | PASS |
| L-02 | 55 live products: page + photo | 200 | PASS |
| L-03 | Live shop cards (55): price, MRP, % OFF, ₹/kg vs data | all match | PASS (0 mismatches) |
| L-04 | Live catalogue: 189 variant ids unique; category counts match products | yes | PASS |
| L-05 | Free delivery boundary 121001 (free ≥ ₹499): ₹498 / ₹499 / ₹500 | fee ₹25 / ₹0 / ₹0 | PASS |
| L-06 | 121005 (free ≥ ₹599, min ₹149): ₹598 / ₹599; ₹148 | ₹30 / ₹0; "minimum ₹149" | PASS |
| L-07 | 121006 (no free-delivery amount): ₹624 | fee ₹10 (as configured; see OPEN-05) | PASS (data issue reported) |
| L-08 | Unsupported PIN 560034 / invalid PIN 12345 | "not serviceable" / 400 "valid 6-digit PIN" | PASS |
| L-09 | Quantity 0 / 999 / duplicate lines / unknown variant / empty cart / sold-out item / bad coupon | 400 / 400 (max 20) / merged / UNAVAILABLE / EMPTY_CART / OUT_OF_STOCK / COUPON_INVALID | PASS |
| L-10 | `/api/admin/*`, `/api/cron/*` without auth | 401 | PASS |
| L-11 | Security headers (CSP, HSTS, XFO) | present | PASS |
| L-12 | No development banner / dev sign-in on live | absent | PASS |
| L-13 | Search "tomatoes", "green capsicum", "brocoli", "carot", "potatoes", "tamatar" | relevant product first | PASS |
| L-14 | Phone (390 px) Price filter menu on live | visible on screen | PASS |
| G-01 | "Use my location" with permission denied (local) | message: "Location permission was denied… enter your PIN code" | PASS |
| G-02 | "Use my location" with no geolocation in the browser (local) | message: "Couldn't find your location. Enter your PIN code instead." | PASS |
| P-01 | Live desktop timing | TTFB 0.3 s warm (2.2 s cold start), LCP 1.6 s | PASS (measured) |
| P-02 | Phone Core Web Vitals on a throttled network | — | NOT RUN — live site not reachable from the automated environment; only the owner's browser was available |
| A-01 | Live database RLS / advisors | — | BLOCKED — live Supabase project not in our access (verified locally with the same migrations: PASS) |
| A-02 | Real email codes, Google sign-in, Razorpay, WhatsApp on live | — | BLOCKED — not configured / would contact real people |
| A-03 | Android/iOS release build on a device | — | NOT RUN — Expo/Google build servers not reachable here; owner runs `eas build` |
| A-04 | Placing a real order on live | — | NOT RUN by design (no production orders) |

## 4. Notes

- **Flaky run:** an earlier regression run on 28 Oct (≈02:05 IST) reported 4 failing tests in one web test file.
  It was not reproduced in 4 later full runs (all 216/216). The failing file was not recorded at the time; the
  regression script now saves the full unit output and prints failing test names, so a repeat can be diagnosed.
- Local test data is reset by the test setup; the browser suites use the throwaway `fb_ui` database.
