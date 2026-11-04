# Fresh Basket — Production-Readiness Audit (4 Nov 2026)

**Branch:** `audit/production-readiness` (from `main` @ `d7e13fc`, PR #35) · **Live:** https://fresh-basket-veg.vercel.app
**Scope:** web (`apps/web`), shared logic (`packages/shared`), database (`supabase/migrations`), mobile (`apps/mobile`),
Vercel configuration and production logs (read-only), DNS/domains (read-only).

## How this audit was done

1. **Repository state recorded first.** The uploaded ZIP was an older snapshot (it matches neither `main` nor `main~1`;
   it lacks PR #35 and differs in the login page/schemas), so work started from the GitHub `main` branch, which is
   what production runs (Vercel deployment `dpl_EQmvUhuuGjXAmXJeQYmJSTRCjjpj` = commit `d7e13fc`). Working tree clean,
   no uncommitted changes; new branch `audit/production-readiness`.
2. **Previous reports read** (`docs/audit/*`: 7 earlier rounds, ~77 fixed bugs). Nothing from them was assumed to be
   still open — each open item (S-14, S-21, S-23, S-24, S-11, OPEN-07/08, FIX_PLAN #10/#12) was re-checked in code.
3. **Baseline checks** before any change: typecheck ✅, lint ✅, 304/304 tests ✅, production build ✅.
4. **Three independent deep reviews** (money/stock/SQL; auth/admin/API security; mobile app) plus my own review of
   infrastructure, cron, SEO, performance and deployment. Every finding below was reproduced (test, SQL script,
   probe against a database built from the real migrations, live API read) or is marked POTENTIAL.
5. **Live, read-only checks** through the Vercel API: projects, domains, DNS config, env var *names* (values never
   read), deployments, runtime error groups. The sandbox's network policy blocks direct HTTPS to the live hosts, so
   live pages were fetched via Vercel's own fetch tool. The live Supabase project (`dhtkqanvrnuyykslxdfs`) is **not**
   in the connected Supabase account (permission denied), so live RLS/advisors were not inspected.

## Status legend

**CONFIRMED** reproduced/observed · **POTENTIAL** plausible, not reproduced · **FIXED** fixed + tested in this branch ·
**PARTIAL** fixed in code, needs configuration · **OPEN** not fixed (reason given) · **EXTERNAL** needs a dashboard/owner
action · **UNVERIFIED** couldn't be checked from here · **PREV-FIXED** fixed earlier, verified in this round.

## Summary

| Severity | Found | Fixed (this branch) | Remaining |
| --- | --- | --- | --- |
| Critical | 0 | 0 | 0 |
| High | 2 | 0 (1 mitigated) | 2 |
| Medium | 15 | 8 (+1 previously fixed, verified) | 6 |
| Low | 21 | 14 | 7 |
| **Total** | **38** | **22** | **15** |

No Critical issue was found. No code path was found that marks an order paid without server verification, lets a
customer change prices/payment status, read another customer's orders, oversell stock or drive stock negative.

## Findings

Severity · ID · status · where · root cause → fix. Reproduction/evidence for each is in `TEST_RESULTS.md` (§ by ID)
and the detailed write-ups in `SECURITY_AUDIT.md`, `DOMAIN_SERVER_AUDIT.md`, `BUG_FIX_REPORT.md`.

### High

| ID | Status | Where | Root cause | Recommended solution / fix |
| --- | --- | --- | --- | --- |
| FB-01 | CONFIRMED · EXTERNAL | DNS for `ramsfreshbasket.com`, `www.ramsfreshbasket.com` | The domain is attached to the `fresh-basket-veg` Vercel project (verified, www → 308 apex) but its DNS (Hostinger parking nameservers `nova/cosmos.dns-parking.com`) points the apex A record at `2.57.91.91`, not Vercel. Vercel reports `misconfigured: true` for both. Anyone typing the brand domain gets the registrar's parking page | At the DNS host: apex `A @ 216.198.79.1` (Vercel's current recommendation; `76.76.21.21` also valid) and `CNAME www → cname.vercel-dns.com` (or the project-specific `009100887ca6155d.vercel-dns-017.com`). Then decide the primary domain (see DOMAIN_SERVER_AUDIT §4) |
| FB-02 | POTENTIAL · mitigated | Supabase-mailer sign-up/confirm path (`otp-login.tsx`, `auth/callback/route.ts`), `lib/admin/users.ts` `adminConfirmEmail` | Account pre-takeover: someone signs up with a victim's address + password; if the victim later confirms through Supabase's own mailer (not the store's SMTP path, which already resets the password — S-01), the attacker's password survives. Admin "confirm email" had the same effect | **Fixed:** admin confirmation now replaces the sign-up password with a random one and ends sessions. **Live exposure likely closed:** `SMTP_*` + service role + `APP_SECRET` are set in Production since 4 Nov, so `emailCodesBySmtp()` routes sign-in/sign-up through the store path with the S-01 fix — **UNVERIFIED** (no live sign-up test). Verify with a throwaway address after merge; keep SMTP configured |

### Medium

| ID | Status | Where | Root cause | Fix |
| --- | --- | --- | --- | --- |
| FB-03 | CONFIRMED · FIXED | `lib/orders.ts` `insertOrder`, `placeOrderSchema`, checkout clients | Server re-prices under lock at submit but never compared with the total the customer was shown → COD order committed at a new total after a price edit (repro: quoted ₹153 → placed ₹281) | Clients send `expectedTotal`; mismatch → 409 `PRICE_CHANGED`, nothing saved, client re-quotes. Optional field (old app versions keep working) |
| FB-04 | CONFIRMED · FIXED | `release_expired_reservations()`, `customerCancel` | A UPI order with a customer-reported UTR expired/cancelled as "payment failed"; nothing told staff to check the bank | UTR orders held 48 h after the UTR (migration `20261104000002`), "UPI payments to check" dashboard tile, customer self-cancel refused while unchecked |
| FB-05 | CONFIRMED · FIXED | `api/auth/email/route.ts` | Only per-/64 limits before the shop-wide 300/h cap → one IPv6 /48 (31 × /64) used the whole cap; every customer then got 429 and the mailbox sent 300 attacker-chosen emails | 60/h per /48 before the shop cap (generous on purpose: Indian carriers put many real customers in one /48). CAPTCHA recommended (EXTERNAL: Turnstile keys) |
| FB-06 | CONFIRMED · FIXED | `lib/admin/users.ts` | Any admin could change another admin's (incl. the owner's) sign-in email (auto-confirmed), set their password, create a reset link or demote them | Only an **owner** (confirmed `auth.users` email listed in `ADMIN_EMAILS`) may do that to another admin; customers/staff unaffected |
| FB-07 | CONFIRMED · FIXED | all `api/admin/**` | No audit trail of admin actions (`admin_request_log` is only a retry de-duplication table) | `admin_audit_log` (actor, role, method, path incl. record id, status) written by the API wrapper for every admin change and refused attempt; request bodies never stored |
| FB-08 | CONFIRMED · FIXED | stock (`products.stock_grams`, `product_variants.stock`) | No stock movement history (FIX_PLAN #12) | `stock_movements` filled by database triggers for every change (orders, cancels, expiry, late payment, adjustments, admin edits, SQL editor) with reason, order and actor |
| FB-09 | CONFIRMED · EXTERNAL | Vercel project `fresh-basket` → `fresh-basket-brown.vercel.app` | Second project deploys the same code against the same database and declares itself canonical in robots/sitemap/`<link rel=canonical>` → duplicate indexing (OPEN-08, still present) | Owner: set `NEXT_PUBLIC_APP_URL` on that project to the primary URL and redeploy, or (better) remove the project / redirect its domain |
| FB-10 | CONFIRMED · PARTIAL | `apps/web/vercel.json` cron (daily 02:00 IST) | Team is on Vercel **Hobby** (confirmed: 1-hour log retention), which allows only daily crons; a sub-daily schedule would fail deploys. Holds are released lazily on shopper traffic, but a quiet shop shows held items out of stock until then | New `.github/workflows/release-expired-holds.yml` calls the existing secret-protected endpoint every 10 min (idempotent). Needs GitHub secret `CRON_SECRET` + variable `SITE_URL` |
| FB-11 | CONFIRMED · EXTERNAL | Vercel plan | Hobby is for personal, non-commercial use under Vercel's terms; also 1 h log retention, daily cron only | Upgrade the team to **Pro** before taking real orders; then the cron can be `*/10 * * * *` in `vercel.json` |
| FB-12 | UNVERIFIED · EXTERNAL | `vercel.json` `regions: ["iad1"]` | Functions run in Washington DC for Indian customers; database region unknown (live Supabase project not accessible). Wrong pairing costs ~200–250 ms per DB round trip | Owner: Supabase → Project Settings → General → Region. If `ap-south-1` (Mumbai) → set `"regions": ["bom1"]`; if Singapore → `sin1`. **Not changed** (rule: check the DB region first) |
| FB-13 | CONFIRMED · FIXED | `apps/mobile/src/lib/config.ts` | Release build made without `EXPO_PUBLIC_API_URL` silently pointed at `http://localhost:3000` (verified in an Android export) | Non-dev builds default to the production URL; warning if not https. Re-export verified: only `https://fresh-basket-veg.vercel.app` in the bundle |
| FB-14 | CONFIRMED · OPEN | `apps/mobile/src/lib/auth.tsx:184` (S-24) | Supabase refresh token stored in AsyncStorage (plain app storage) | Encrypted-AsyncStorage pattern (AES key in SecureStore). Needs device testing — not done here |
| FB-15 | CONFIRMED · OPEN | `apps/mobile/package-lock.json` (S-11) | `npm audit`: 17 advisories (2 low, 9 moderate, 6 high), up from 11 on 31 Oct; one (`decode-uri-component` via `expo-router → query-string`) is in the runtime bundle (deep-link parsing DoS, low impact) | Expo SDK 58 upgrade + device re-test (major upgrade; not done blind) |
| FB-16 | CONFIRMED · EXTERNAL | Vercel env (Production) | No `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` → online card/UPI checkout is off; the store runs on COD + WhatsApp + staff-verified UPI | Only if online payment is wanted: Razorpay live keys + webhook (see `ENVIRONMENT_SETUP.md`); test-mode first |
| FB-17 | CONFIRMED · PREV-FIXED | `lib/db.ts`, `lib/orders.ts` | Production errors 2–3 Nov: `EMAXCONN max client connections reached (200)` and pg "client already executing a query" | Fixed by PR #30 (deployed 3 Nov 22:40 UTC). Vercel error groups: last occurrence 3 Nov 18:10 UTC — none since |

### Low

| ID | Status | Where | Root cause | Fix |
| --- | --- | --- | --- | --- |
| FB-18 | CONFIRMED · FIXED | `placeWhatsAppOrder` | Shop-wide guest cap (40 open) read without a shared lock → burst reached 46 | Second advisory lock for guests; regression test fails without it (46) and passes with it |
| FB-19 | CONFIRMED · FIXED | `app/(shop)/pay/[id]/page.tsx` → `ensureRazorpayOrder` | A GET page render (refresh/prefetch) could cancel the order on a gateway timeout | `cancelOnFailure: false` for page renders; only POSTs may cancel |
| FB-20 | CONFIRMED · FIXED | grants on `orders`, `order_events`, `order_adjustments` | RLS limits rows, not columns: customers could read staff ids (`actor`, `created_by`, `done_by`) and internal order fields | Column-level SELECT grants without those columns |
| FB-21 | CONFIRMED · FIXED | `order_items`, `orders` | No index on FK `order_items(product_id/variant_id)`, `orders(coupon_id)` → sequential scans under the product lock | Indexes added |
| FB-22 | CONFIRMED · FIXED | `lib/payments/process.ts` | Checkout-payment webhook didn't require `status = captured` / `INR` (payment-link path did) | Same check added (defence in depth; signature already verified) |
| FB-23 | CONFIRMED · FIXED | `proxy.ts`, `lib/auth.ts`, `lib/client/supabase.ts` | Supabase session cookies without `Secure` | `Secure` on HTTPS |
| FB-24 | CONFIRMED · PARTIAL | `app/auth/callback/route.ts` (S-21) | Any link type with `next=/reset-password` put the browser in "set new password" mode (login-CSRF helper). The wider S-21 (GET email link signs in at once) remains | Recovery mode only for real recovery links. Full S-21 fix (confirm page + POST) = product decision, OPEN |
| FB-25 | CONFIRMED · PARTIAL | `lib/db.ts`, `scripts/migrate.mjs` (S-23) | DB TLS `rejectUnauthorized: false` | Opt-in `DATABASE_CA_CERT` enables verification; needs the CA from Supabase (EXTERNAL); test on Preview first |
| FB-26 | CONFIRMED · OPEN | `(shop)/loading.tsx` streaming (S-14) | Unknown `/product/x`, `/category/x` return 200 (Next adds `noindex`) because `loading.tsx` starts the stream before `notFound()` | Options in PERFORMANCE_REPORT §SEO; not changed (DB lookup in Proxy would add load right after the pool-exhaustion incident; removing `loading.tsx` changes navigation UX) |
| FB-27 | CONFIRMED (code) · FIXED | `components/admin/inventory-table.tsx` | After a partly failed multi-part save, editing anything gave new request ids → parts already saved were re-applied (stock change doubled) | Saved rows' edits dropped and table reloaded on partial failure |
| FB-28 | CONFIRMED · FIXED | `app/robots.ts` | Non-standard `Host:` with a scheme | Removed |
| FB-29 | CONFIRMED · FIXED | home page | No LocalBusiness/WebSite structured data | `GroceryStore` + `WebSite` (SearchAction) JSON-LD from real settings/areas only; no phone, ratings or invented data |
| FB-30 | CONFIRMED · FIXED | `supabase/all-migrations.sql` | Bundle was missing the 6 migrations since 27 Oct | Regenerated; applied cleanly to a fresh DB (39 migrations recorded) |
| FB-31 | CONFIRMED · FIXED | `apps/mobile/src/lib/cart.tsx` | A quote in flight was applied after the cart was emptied | Request id bumped on empty |
| FB-32 | CONFIRMED · FIXED | `apps/mobile/src/app/orders/[id].tsx` | Polled every 4 s forever while `pending_payment`, even offline/401 | Stops after 5 failures, on 401/403/404, or 2 min after the hold ends |
| FB-33 | POTENTIAL · OPEN | `mark_order_paid` revival `exception when others` | A transient error (deadlock/lock timeout) during late-payment revival becomes `refund_pending` permanently | Catch only the custom `revival_blocked` error; not changed (no lock cycle found; sensitive function — change with a dedicated test) |
| FB-34 | POTENTIAL · OPEN | `api/payments/razorpay/verify` | Order status read without lock before capture; a cancel in between → captured then refund | Re-check after capture, auto-refund |
| FB-35 | POTENTIAL · EXTERNAL | Razorpay settings | `payment.authorized` not handled: if auto-capture is off and the browser closes before verify, the authorisation is never captured | Keep Razorpay **auto-capture ON** (Dashboard → Settings → Payment capture) |
| FB-36 | CONFIRMED · OPEN | `apps/mobile/src/lib/id.ts` | Idempotency keys fall back to `Math.random` on Hermes | `expo-crypto` `randomUUID()` (new dependency → with the SDK upgrade) |
| FB-37 | POTENTIAL · OPEN | `apps/mobile` `payment.ts`, `auth-callback.tsx` | Android may deliver the return deep link twice (duplicate order screen); Google sign-in code dropped if the link reaches the app route | Device test needed |
| FB-38 | CONFIRMED (code) · OPEN | `lib/admin/catalog.ts` `alreadyApplied` | A reused request id with a different payload is silently skipped | Key by payload hash; main trigger closed by FB-27 |

## Verified as correct (no change needed)

Server-side pricing/quote under row locks · guarded stock take + `CHECK (stock >= 0)` · idempotency key + fingerprint
+ per-customer advisory lock · `mark_order_paid` (amount = total, payment-id reuse, duplicate payment, revival checks,
stock returned once) · Razorpay HMAC (checkout + webhook raw body) + server fetch of the payment · payment events
stored once · cron secret (constant-time, fails closed — `CRON_SECRET` is now set in Production + Preview) · RLS on
all 25 public tables · SECURITY DEFINER functions with fixed `search_path`, EXECUTE revoked from anon/authenticated ·
every `api/admin/**` handler (31) calls `requireAdmin`/`requireStaff` · CSRF origin check, no credentialed CORS ·
`safeNextPath` open-redirect protection · uploads sniffed by bytes · secrets never `NEXT_PUBLIC_` · `ADMIN_EMAILS`
bootstrap promotes only confirmed `auth.users` emails · mobile never trusts its own prices or payment result.

## Deliverables

`AUDIT_REPORT.md` (this) · `BUG_FIX_REPORT.md` · `SECURITY_AUDIT.md` · `DOMAIN_SERVER_AUDIT.md` ·
`PERFORMANCE_REPORT.md` · `PRODUCTION_READINESS.md` · `ENVIRONMENT_SETUP.md` · `DEPLOYMENT_GUIDE.md` · `TEST_RESULTS.md`
