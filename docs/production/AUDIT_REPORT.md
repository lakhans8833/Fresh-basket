# Fresh Basket — Audit Report (round 8, 5 Nov 2026)

Scope: whole repository (`apps/web` Next.js 16, `apps/mobile` Expo SDK 57, `packages/shared`, `supabase/migrations`),
the live site `https://fresh-basket-veg.vercel.app` (read-only checks), Vercel project settings (via API, names only)
and the earlier audit rounds in `docs/audit/` (rounds 1–7, 97 issues fixed). Issues already fixed there are not
repeated; their table is in `docs/audit/BUG_REPORT.md`.

Labels used in every report: **Confirmed** (reproduced), **Fixed** (code changed + test proves it), **Potential risk**
(no failure seen, risk explained), **Unverified** (could not be checked from here), **External** (needs the owner, a
dashboard or a business decision — never invented).

## Repository state at the start
- Branch `main` @ `d7e13fc` (PR #35), clean working tree; work done on branch `audit/round-8`.
- Root scripts: `typecheck`, `test`, `build`; web: `lint`, `typecheck`, `test` (vitest), `build` (= migrate + images + next build).
- Migrations: 40+ files in `supabase/migrations`, applied automatically by `apps/web/scripts/migrate.mjs` on **production**
  builds only (preview builds skip them — verified in the script).

## Issues found in this session (4–5 Nov 2026)

| ID | Sev. | Status | Area / file | Root cause | Reproduction | Fix | Evidence |
|---|---|---|---|---|---|---|---|
| R8-01 | High | Fixed (PR #32) | Email code sign-in — `apps/web/src/lib/auth-email.ts` | For a new / never-confirmed account the code was generated, then the password was replaced; Supabase clears pending codes on a password change, so the emailed code was already dead | New email → "Send code" → enter code → "That code is wrong…" (owner, live, 4 Nov 22:44) | Replace password first, then generate the code that is emailed | `test/auth-email` new case fails on old order, passes now |
| R8-02 | Medium | Fixed (PR #30) | DB pool — `lib/db.ts`, `lib/orders.ts` | `hydrateOrders` ran 3 queries at once (3 connections per request; pg overlapping-query deprecation); pooler hit `EMAXCONN 200` once | Vercel runtime errors 3 Nov 18:10 UTC | Sequential queries, pool 5→3, EMAXCONN retried once for reads | `test/db-connections`; 0 runtime errors since |
| R8-03 | Medium | Fixed (PR #31) | iPhone/iPad forms — `app/globals.css` | Inputs 14–15 px → iOS Safari zooms on focus | Device sweep, 5 devices | 16 px on phones/touch | sweep 90/90 clean |
| R8-04 | Low | Fixed (PR #31) | Checkout bar on 320 px phones | Long label wrapped, total pushed out | iPhone SE screenshot | Shorter label < 360 px, no wrap | screenshot + sweep |
| R8-05 | Low | Fixed (PR #34) | CSP console report on checkout | Zod v4 probes `new Function` (blocked by CSP, caught) | DevTools "CSP blocks eval" on chunk with `allowsEval` | `z.config({ jitless: true })`; CSP unchanged | live chunk inspected |
| R8-06 | Medium | Fixed in code (this branch) + **External** step | Duplicate site — `src/proxy.ts`, `src/lib/canonical-host.ts` | Project `fresh-basket` serves a full copy at `fresh-basket-brown.vercel.app` with its own canonical + sitemap (= OPEN-08) | Live: brown canonical/sitemap = brown host | Production page requests on another host → 308 to `NEXT_PUBLIC_APP_URL` | `test/audit-round-8` (7 cases). Needs `NEXT_PUBLIC_APP_URL` on the `fresh-basket` project |
| R8-07 | Medium | Fixed (this branch) | Session cookies — `proxy.ts`, `lib/auth.ts`, `lib/client/supabase.ts` | Supabase defaults leave `Secure` off | Live `cookieStore`: `sb-…-auth-token secure:false` | `Secure` on https in proxy, server and browser clients | code + typecheck; verify live after deploy |
| R8-08 | Medium | Fixed (this branch) | No admin audit trail | Nothing recorded who changed prices, stock, order/payment status, roles, settings | — | `admin_audit_log` table; every saving `/api/admin/*` call logged (sanitised) | `test/audit-round-8` |
| R8-09 | Medium | Fixed (this branch) | No stock history | Stock changes left no record | — | `stock_movements` ledger written by triggers, with reason + actor | `test/audit-round-8` |
| R8-10 | Low | Fixed (PR #35) | Store phone shown | Owner asked to hide it | — | Not rendered anywhere; API sends `null` | live check, 7 pages |

Found by an independent code review (5 Nov) and **not changed** (reasons in `BUG_FIX_REPORT.md`):

| ID | Sev. | Status | Area | Summary |
|---|---|---|---|---|
| R8-11 | Medium | Potential risk (online payments are off) | `lib/payments/process.ts` webhook | `payment.authorized` is ignored; with Razorpay *manual* capture a payment whose browser closes is never captured. Use auto-capture or handle the event before enabling online payments |
| R8-12 | Low | Confirmed | `mark_order_paid` SQL, `lib/admin/orders.ts` | "Slot ended?" uses the slot's current end time, not the window stored on the order (only matters if a slot is edited) |
| R8-13 | Low | Confirmed | COD collection | No field for "collected less than total" |
| R8-14 | Low | Confirmed (= OPEN-11) | Guest WhatsApp orders | Can be used to tie up stock / block a number for 12 h; needs an owner-chosen size cap |

## Still open from earlier rounds (owner / configuration) — live state checked 5 Nov
| ID | Sev. | Status | Item | Live state |
|---|---|---|---|---|
| OPEN-01 | — | Changed | Support contacts | WhatsApp, email, hours set; phone hidden by owner's choice |
| OPEN-02 | — | **Resolved** | Email codes | SMTP (Gmail) live since 4 Nov; codes arrive from "Rams Fresh Basket" (owner verified) |
| OPEN-03 | High | External | Legal identity | All 7 legal fields empty |
| OPEN-04 | High | External | Product photos | 10 products without photo, 16 with development photos |
| OPEN-05 | Medium | External | Delivery areas | 121006 has no free-delivery amount; area names empty; Sector 9 not configured |
| OPEN-07 | — | **Resolved** | `CRON_SECRET` | Set (`/api/health`: `cronSecretSet: true`) |
| OPEN-08 | Medium | Code fixed (R8-06) + External | Duplicate domain | Set `NEXT_PUBLIC_APP_URL` on project `fresh-basket` |
| OPEN-09 | Low | Confirmed | Unknown product URLs answer 200 with a not-found page (noindex) | unchanged |
| OPEN-11 | Medium | External | Guest WhatsApp order size cap | owner decision |

## Areas checked with no new issue
Order placement/idempotency/duplicate submit, stock locking (lock order, never negative), coupons, cancellations,
refund/replacement adjustments, analytics revenue, RLS on every table, role checks on every admin route, payment
signature/amount/currency/duplicate webhook handling, IST dates/slots, rate limits, CSP/security headers, robots
rules, 84/84 public pages + 14 admin APIs live, iPhone/Android emulation, Expo iOS/Android bundles, TypeScript (web,
shared, mobile).
