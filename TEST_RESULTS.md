# Test Results — 4 Nov 2026

Environment: Node 22.23, npm 10.9, PostgreSQL 16.15 (local, migrations + seed applied by the test setup into a
throwaway `freshbasket_test` database), Chromium 1243 (headless), Expo SDK 57 tooling. No production data, accounts,
payments or emails were used. Razorpay/Supabase Auth calls are exercised against the repository's mocks/fake servers.

## 1. Project checks (final run, branch `audit/production-readiness`)

| Command (actual script) | Before changes | After changes |
| --- | --- | --- |
| `npm ci` (root workspaces) | PASS | — |
| `npm run typecheck` (shared + web; `tsc --noEmit`) | PASS | **PASS** |
| `cd apps/web && npx eslint` (`npm run lint` there) | PASS (0 problems) | **PASS (0 problems)** |
| `npm test` — shared (vitest) | 52/52 PASS | **52/52 PASS** |
| `npm test` — web unit + integration on real Postgres | 252/252 PASS (30 files) | **269/269 PASS (32 files)** |
| `npm run build` (migrate skipped: no DB URL; `next build`) | PASS | **PASS** |
| Mobile `npx tsc --noEmit` (copy of `apps/mobile`, deps via `npm ci`) | PASS | **PASS** |
| Mobile `EXPO_OFFLINE=1 npx expo export --platform android` | PASS (bundle pointed at `http://localhost:3000` without env — FB-13) | **PASS** (only `https://fresh-basket-veg.vercel.app` in the bundle) |
| Mobile `npx expo-doctor` | 19/21 (2 checks need network: `exp.host`, RN Directory) | — |
| Mobile `npm audit` | 17 vulnerabilities (2 low, 9 moderate, 6 high) — FB-15 | unchanged (needs SDK upgrade) |

`npm run typecheck`/`test` at the root are the project's real equivalents of the requested `npm run typecheck` /
`npm run test`; there is no root `lint` script (lint lives in `apps/web`).

**Totals (final): 321 automated tests passed, 0 failed.** During the work 2 tests failed after a change and were
resolved (§3).

## 2. Browser end-to-end (production build `next start`, local DB, `ALLOW_DEV_MODE=true` for the dev login)

| Suite | Result | Notes |
| --- | --- | --- |
| `e2e/flow.py` — search → product → basket + coupon → checkout (COD) → test payment → reorder | **PASS** (`E2E OK …/orders/<id>`) | checkout now sends `expectedTotal` |
| `e2e/checkout_retry.py` — idempotency keys across retries | **PASS** (`CHECKOUT RETRY E2E OK`) | |
| `e2e/whatsapp.py` — guest WhatsApp order, validation, review, message | **PASS** (`WHATSAPP E2E OK`) | first two runs failed on setup only: no WhatsApp number configured, then a stale on-disk Next data cache after setting it in the DB — not code defects |
| Other 17 suites (`policy_pages`, `deep_check_4`, `email_otp`, `signup_code`, admin charts, …) | NOT RUN | time; unaffected areas or covered by integration tests |
| Mobile `apps/mobile/e2e/smoke.py`, `auth_mock.py` | NOT RUN | |
| Responsive/axe sweep | NOT RUN this round (28 Oct: 9 widths, 0 issues) | |

## 3. Failures during the work (and what they meant)

| Test | Failure | Cause | Resolution |
| --- | --- | --- | --- |
| `order-lifecycle › UPI paid → customer cancels → refund pending` | my new UPI guard refused the cancel | **real bug in my first version of FB-04**: it also blocked cancelling a UPI order already confirmed paid | guard limited to `payment_status = 'pending'`; test passes |
| `orders.integration › admin users … changes roles safely` | expected 409, got 403 | intended behaviour change (FB-06): a non-owner demoting an admin is now refused by the owner check before the "keep one admin" rule | expectation updated with a comment |
| `production-readiness` (first run, 7 of 9) | `ORDER_REJECTED` | my test basket (2 kg onion = ₹96) was below the seed's ₹99 minimum order | test basket 4 kg |

## 4. New regression tests (all PASS)

| File | Tests | Covers |
| --- | --- | --- |
| `apps/web/test/production-readiness.integration.test.ts` | 9 | FB-03 PRICE_CHANGED (refused, nothing saved, same key succeeds, field optional) · FB-04 UTR hold / no self-cancel / dashboard count / 48 h expiry / UPI without UTR still expires · FB-18 concurrent guest burst ≤ 40 · FB-08 stock movements (−4000 g order_placed, +4000 g order_cancelled, admin_edit) · FB-07 audit row (actor/role/method/path/status), refused attempt recorded, anonymous not, no body/secret columns · FB-20 column grants (own order readable; `actor`, `idempotency_key`, `created_by` → 42501; order screen still loads) · new tables unreadable by customers |
| `apps/web/test/structured-data.test.ts` | 3 | FB-29 only real fields; no phone/ratings/price range; https-only socials; `</script>` escaping |
| `apps/web/test/admin-edit-user.integration.test.ts` | +4 | FB-06 non-owner 403 ×4 (target unchanged), owner allowed, unconfirmed listed email refused, customers/staff manageable |
| `apps/web/test/auth-callback.test.ts` | +1 | FB-24 magic/sign-up/email links with `next=/reset-password` don't set recovery mode; PKCE still does |

**Mutation check:** with the FB-18 lock removed, the burst test fails (`expected 46 to be ≤ 40`); restored → pass.

## 5. Evidence by finding (reproductions)

| ID | Evidence |
| --- | --- |
| FB-01 | Vercel `get_domain_config`: A `2.57.91.91`, NS `*.dns-parking.com`, `misconfigured: true` (apex + www) |
| FB-03 | reviewer probe: quoted `total 15300` → admin doubles price → `placeOrder(cod)` → `total 28100 status placed` |
| FB-04 | probe: `{"status":"cancelled","payment_status":"failed","upi_reference":"UTR123456789"}`, dashboard `refundsPending = 0` |
| FB-05 | probe: 31 × /64 × 10 → `{200: 300, 429: 10}`, normal customer then `429` |
| FB-06 | probe: second admin → owner email changed + confirmed, role `customer`, 0 audit tables |
| FB-09 | live `fresh-basket-brown.vercel.app/robots.txt` → `Sitemap: https://fresh-basket-brown.vercel.app/sitemap.xml` |
| FB-10/11 | Vercel logs API: "The hobby plan does not retain runtime logs for the requested time range" |
| FB-13 | `strings` on the Android bundle: only API host `http://localhost:3000` |
| FB-17 | Vercel runtime error groups (7 days): `EMAXCONN` last 3 Nov 18:10 UTC, pg overlap last 2 Nov 20:27 UTC; PR #30 deployed 3 Nov 22:40 UTC |
| FB-18 | probe: 39 open + burst of 8 → `after 44` (limit 40); test without fix → 46 |
| FB-20 | probe: customer via `authenticated` role read `actor = admin:00000000-…a1` |
| FB-26 | local `curl`: `/product/no-such-xyz` 200, `/category/no-such-xyz` 200, `/no-such-page` 404 |
| FB-30 | `git diff` of the regenerated bundle added 6 missing migrations; fresh DB from the bundle → 39 recorded, new tables present |

## 6. Not tested (needs access or would touch real systems)

Live payments (Razorpay not configured in production; test-mode keys not available) · live Supabase Auth emails /
SMTP delivery · Android/iOS device builds (EAS) · live Core Web Vitals · live database policies (project not in the
connected Supabase account) · public reachability of the live hosts from this sandbox (egress blocked).

## 7. Round 2 — `fix/remaining-audit-items` (5 Nov 2026)

Same environment; mobile on **Expo SDK 58** after FB-15. Every item's test was written first and failed before the fix
(failure shown), then passed.

### Project checks (final run, after all 10 commits)

| Command | Result |
| --- | --- |
| `npm ci` | **PASS** |
| `npm run typecheck` | **PASS** |
| `cd apps/web && npx eslint` | **PASS (0 problems)** |
| `npm test` — shared | **52/52 PASS** (8 files) |
| `npm test` — web unit + integration (real Postgres) | **299/299 PASS** (36 files; was 269) |
| `npm run build` | **PASS** |
| Mobile `npx tsc --noEmit` | **PASS** |
| Mobile `npm test` (new, Node vitest) | **9/9 PASS** (3 files) |
| Mobile `EXPO_OFFLINE=1 npx expo export --platform android` | **PASS** (SDK 58, 3564 modules) |
| Mobile `npm audit` | **5 moderate** (was 17: 2 low, 9 moderate, 6 high) — dev tooling only |

**Totals: 360 automated tests passed, 0 failed** (52 + 299 + 9).

### Browser end-to-end (production build, local DB)

| Suite | Result |
| --- | --- |
| `e2e/flow.py` | **PASS** (`E2E OK …/orders/<id>`) |
| `e2e/checkout_retry.py` | **PASS** (`CHECKOUT RETRY E2E OK`) |
| `e2e/whatsapp.py` | **PASS** (`WHATSAPP E2E OK`) |
| `e2e/login_recovery.py` (fake GoTrue; clicks the new confirm page) | **31/31 PASS** |
| `e2e/email_otp.py` | **20/20 PASS** |
| `e2e/signup_code.py` | **7/7 PASS** |
| FB-26 `curl` on `next start` | `/product/tomato` 200 · `/product/no-such-veg-xyz` **404** · `/category/leafy-greens` 200 · `/category/no-such-cat` **404** (before: 200 / 200) |
| App `smoke.py` (SDK 58 web build) | **13/13 PASS** |
| App `auth_mock.py` | **13/13 PASS** |
| App `whatsapp_order.py` | **9/9 PASS** — first run timed out: the local test DB had only 1.5 kg broccoli left after the earlier e2e orders, so the "+" button was disabled (test data, not a code defect); restocked the local DB → pass |

### Tests written first (failed → pass)

| ID | Test | Failure before the fix |
| --- | --- | --- |
| FB-33 | `test/remaining-audit` (4) | 40P01 / 55P03 / 40001: "promise resolved instead of rejecting" (order went to refund_pending) |
| FB-34 | `test/razorpay-http` FB-34 (2) | the customer's cancel completed while capture was in flight (`expected true to be false`) |
| FB-38 | `test/remaining-audit` FB-38 (2) | same id + different content: "promise resolved instead of rejecting" |
| FB-26 | curl + `test/known-slugs` (4) | unknown slugs answered 200 |
| S-21 | `test/auth-callback` (12, 3 new) | GET with token_hash answered 307 and called verifyOtp; POST missing |
| FB-05 | `test/turnstile.integration` (6) | no/bad token: 200 and the email was sent |
| FB-14 | `apps/mobile/test/large-secure-store` (4) | module missing (session stored as plain JSON) |
| FB-36 | `apps/mobile/test/id` (1) | with no global crypto, two ids were identical (`88888888-…`) |
| FB-37 | `apps/mobile/test/deep-links` (4) | module missing (code dropped; duplicate link not filtered) |
| FB-15 | upgrade checks above | 17 audit advisories (6 high) on SDK 57 |

### Not tested here (needs a real phone or live systems)

FB-14 sign-in survives app restart and the update from the SDK 57 build · FB-37 Google sign-in round trip and the
Android payment return link · SDK 58 native build (EAS) on Android/iOS · FB-05 with real Cloudflare keys · live
Razorpay (FB-34 used mocked Razorpay).

## 8. Deep check after round 2 (6 Nov 2026)

| Check | Result |
| --- | --- |
| Review: FB-14 store under concurrent saves (supabase-js 2.119 auth is lockless) | **bug found + fixed** (`FB-14 follow-up`): two saves at once could pair one save's key with the other's data → signed out. Test written first (failed: `null`), per-key queue added → mobile 10/10 |
| Full `npm test` on a freshly restarted container | first run: `payment-integrity` 2 failed — a fixed 200 ms sleep in the test (only 3 of 6 mocked gateway calls had started); code untouched on this branch, file passed 3/3 alone. Test now waits for all six → **52 + 299 PASS** |
| Branch preview (Vercel, read-only GETs) | `/api/catalog/slugs` 200 JSON · `/auth/callback?token_hash=…` → confirm page (200, no-store, noindex, no sign-in on GET) · unknown slug still **200** on the preview: runtime log `slug list unavailable … "<!DOCTYPE "… is not valid JSON` = the preview's Vercel Authentication page. Fail-open as designed; production domain is public. Proxy now sends `VERCEL_AUTOMATION_BYPASS_SECRET` if present and logs the cause. **Verify `curl -I https://fresh-basket-veg.vercel.app/product/no-such-veg-xyz` → 404 after merge** |
| Local `next build` + `next start` after the proxy change | unknown product/category **404**, real ones 200, `/` 200 |
| expo-router 58 `+native-intent` | returning `""` still skips the link (`if (href) listener(href)` in `link/linking.js`) — FB-37(b) holds on SDK 58 |
| Production runtime errors (Vercel, last 48 h) | **0** |
