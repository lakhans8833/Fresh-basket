# Bug Fix Report

Totals across all rounds: **97 issues fixed in rounds 1–7** (table: `docs/audit/BUG_REPORT.md`, sections B–D) plus
**10 in round 8** (below) = **107 fixed**. Every fix has a test or a recorded live check; nothing is marked fixed
without one.

## Round 8 (4–5 Nov 2026)

| ID | Sev. | What was wrong | What changed | Files | Test / evidence | Live |
|---|---|---|---|---|---|---|
| R8-01 | High | Emailed sign-in code was already invalid for new / unconfirmed accounts | Password replaced **before** the emailed code is generated | `apps/web/src/lib/auth-email.ts` | `test/auth-email.integration.test.ts` ("…still works after the password reset") fails on old code | PR #32, deployed 4 Nov |
| R8-02 | Medium | 3 DB connections per order-detail request; pooler limit (200) hit once | Sequential lookups, pool 3/instance, one retry on EMAXCONN for reads / transaction start | `lib/db.ts`, `lib/orders.ts` | `test/db-connections.integration.test.ts` | PR #30 |
| R8-03 | Medium | iOS zoom on every form field | 16 px fields on phones + touch screens | `app/globals.css` | device sweep 90/90 | PR #31 |
| R8-04 | Low | Checkout bar overflow on 320 px | No-wrap labels, short label < 360 px | `components/cart/checkout-view.tsx` | screenshots | PR #31 |
| R8-05 | Low | CSP "eval blocked" report | Zod jitless | `packages/shared/src/schemas.ts` | live chunk check | PR #34 |
| R8-06 | Medium | Second production host indexed as a copy | 308 to `NEXT_PUBLIC_APP_URL` for production page requests on other hosts | `src/proxy.ts`, `src/lib/canonical-host.ts` | `test/audit-round-8` (7 cases) | branch `audit/round-8` |
| R8-07 | Medium | Session cookie without `Secure` | `Secure` on https (proxy, server, browser) | `src/proxy.ts`, `lib/auth.ts`, `lib/client/supabase.ts` | typecheck + login e2e (28/28); live check after deploy | branch |
| R8-08 | Medium | No record of admin changes | `admin_audit_log` + logging in the API wrapper (`route()`), secrets redacted | `lib/http.ts`, `lib/audit.ts`, `lib/request-context.ts`, `lib/auth.ts`, migration `20261105000001` | `test/audit-round-8` (contents, redaction, not-logged cases) | branch |
| R8-09 | Medium | No stock history | `stock_movements` ledger via triggers; reason + actor set per transaction (`noteStock`) | migration `20261105000001`, `lib/db.ts`, `lib/orders.ts`, `lib/admin/*` | `test/audit-round-8` (order −3 / cancel +3 / admin +7 with actor) | branch |
| R8-10 | Low | Store phone shown (owner request) | Never rendered; `/api/settings` returns `supportPhone: null` | footer, contact, support-contacts, settings API, app profile | `test/hide-store-phone` + live 7-page check | PR #35 |

## Deliberately not changed (with reason)
| ID | Why not now | What to do |
|---|---|---|
| R8-11 Razorpay `payment.authorized` | Online payments are **off** on the live store (COD only, `/api/health`). Changing payment capture code without a Razorpay test account to exercise it would be an untested change | Before enabling Razorpay: set **auto-capture** in the Razorpay dashboard, or add webhook capture + a test-mode e2e |
| R8-12 Slot end time | Needs a change to the SQL function `mark_order_paid` (auto-applied migration); low impact (only after editing a slot that has open orders) | Next maintenance round |
| R8-13 COD partial collection | New business field; owner decision on how it should show in sales | Owner decision |
| R8-14 / OPEN-11 Guest order size | Business limit to choose | Owner: e.g. ₹3,000 or 30 packs |
| OPEN-09 404 status for unknown products | Pages are `noindex`; fixing needs restructuring streaming | Low priority |

## Rejected as not-a-bug (investigated)
- Race test "ordering out-of-stock item refused" failed once: the test customer had won the last unit two minutes
  earlier, and the double-tap guard (correctly) returned that order. The test now uses a fresh customer.
- 409 when deleting a category that still has products: intended.
- 503 for "set password" in local runs: no Supabase Auth locally; intended.
