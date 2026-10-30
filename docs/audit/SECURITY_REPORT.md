# Security Report

Scope: website/API (`apps/web`), database (`supabase/migrations`), phone app (`apps/mobile`), live site (read-only).
All active tests ran on a **local copy** with throwaway data; on the live site only public, read-only requests were
made (no sign-in, no orders, no form submissions). No secrets or customer data were printed or stored.

## 1. Summary

| Risk | Open in code | Open in configuration |
| --- | --- | --- |
| P0 critical | 0 | 0 |
| P1 high | 0 | 1 (S-12 email codes: owner SMTP/templates) |
| P2 medium | 0 | 2 (S-11 Expo tooling advisories need an SDK upgrade; S-13 `CRON_SECRET`) |
| P3 low | 1 (S-14 not-found pages return 200) | 0 |

## 2. Verified controls (tested)

| # | Control | How verified | Result |
| --- | --- | --- | --- |
| C-1 | Prices, totals, delivery fees and coupons computed only on the server; client prices ignored | `test/orders.integration`, `test/payment-integrity`, live `/api/quote` boundary checks | PASS |
| C-2 | Customers see only their own orders, items, history, addresses, profile; anon sees no private rows | `test/rls-isolation` (two customers + anon as Supabase roles, against the real migrations) | PASS (local) · BLOCKED on live DB (no access) |
| C-3 | Customers cannot write orders, payments, prices, stock, delivery areas, settings, or their own role; cannot call payment/stock functions | `test/rls-isolation`, `test/security-payments` | PASS |
| C-4 | Admin/staff endpoints require a verified server-side session and role | API permission matrix (31 routes × roles) in the regression run; live: `/api/admin/*` → 401 without a session | PASS |
| C-5 | IDOR: order by id for another user → 404; tracking requires a signed token | `test/orders.integration`, browser test (wrong tracking key doesn't leak) | PASS |
| C-6 | Duplicate submissions / races: idempotency key, duplicate fingerprint, row locks, slot capacity | `test/orders.integration`, race test in the regression run (`FAILS []`) | PASS |
| C-7 | Payment integrity: amount mismatch, reused payment id, late payment, duplicate payment → flagged, never auto-applied | `test/payment-integrity`, `test/razorpay-http`, `test/security-payments` | PASS |
| C-8 | SQL injection: all queries parameterised (`$1…`); dynamic column names only from fixed lists | source review of `apps/web/src/lib/**` | PASS |
| C-9 | XSS: React escaping; email HTML escaped. `dangerouslySetInnerHTML` is used twice: product JSON-LD (escapes `<`) and the UPI QR code (SVG generated on the server by the `qrcode` library — only paths, no user text) | source review, `test/auth-email` (HTML escaping) | PASS |
| C-10 | CSRF: cross-site mutating requests blocked by origin check; `null` origin blocked; CORS never allows credentials | source review (`proxy.ts`), independent review | PASS |
| C-11 | Open redirect: `next` parameters pass `safeNextPath`; OAuth `redirectTo` is same-origin | `test/safe-next`, `test/auth-callback` | PASS |
| C-12 | Security headers: CSP (production), HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | live response headers (28 Oct) | PASS |
| C-13 | Rate limits on every public POST (shared Postgres counter, IPv6 grouped by /64, daily caps on contact/newsletter, email-code limits per network + mailbox) | `test/rate-limit`, `test/deep-check-4`, `test/auth-email`, `test/limit-keys` | PASS |
| C-14 | Uploads: type sniffed from bytes (JPEG/PNG/WebP only), 5 MB cap, random names, no SVG/HTML, path traversal refused | source review, independent backend review | PASS |
| C-15 | Secrets: service-role key, `APP_SECRET`, Razorpay/WhatsApp tokens only server-side; `/api/settings` and `/api/auth/config` expose only public values | source review; live `/api/auth/config` returns only mode, Supabase URL + anon key (public by design) | PASS |
| C-16 | Development login / test payments disabled in production | code: `VERCEL_ENV=production` disables dev features; live: auth mode `supabase`, no dev banner, no dev sign-in button | PASS |
| C-17 | Database functions: `security definer` functions have fixed `search_path`; execute revoked from anon/authenticated where needed; RLS on every table | SQL inspection of the local database built from the migrations | PASS |
| C-18 | Account deletion removes login, profile, addresses, reviews; refused for staff/admin and with open orders; coupon history survives (email hash, no email stored) | `test/account-delete`, `test/deep-check-4` | PASS |
| C-19 | Logs: no OTPs, passwords or phone numbers in server logs (WhatsApp logs use order id) | source review | PASS |
| C-20 | Production dependencies of the website: `npm audit --omit=dev` → 0 vulnerabilities (28 Oct) | command output | PASS |

## 3. Findings fixed during the audits (security-relevant)

| ID | Sev | Finding | Fixed in |
| --- | --- | --- | --- |
| S-01 | P1 | Account pre-takeover via an earlier unconfirmed sign-up (app sign-up; store-sent code sign-in) | PR #20 (BUG-003/004) |
| S-02 | P2 | Email-code abuse: blocking another person's codes; Gmail alias bypass; shop-wide lockout | PR #20 (BUG-005/006) |
| S-03 | P3 | Account existence revealed by password-reset timing | PR #20 (BUG-007) |
| S-04 | P2 | No Content-Security-Policy | PR #19 (BUG-002) |
| S-05 | P2 | Rate limits bypassable by rotating IPv6 addresses | PR #23 (BUG-030) |
| S-06 | P2 | Coupon limits reset by deleting and recreating an account | PR #23 (BUG-031) |
| S-07 | P3 | Deleted login's token caused server errors | PR #23 (BUG-032) |
| S-08 | P3 | NUL byte input → 500 | PR #23 (BUG-034) |
| S-09 | P3 | Unlimited saved addresses (database filling) | PR #23 (BUG-035) |
| S-10 | P1 | Stock multiplication through an admin edit (oversell) | PR #22 (BUG-013) |
| S-11 | P2 | Phone app build tooling: 10 vulnerable dependency versions (4 high) | this branch: `npm audit fix` → 6 remain (see below) |

## 3b. Audit round 6 (31 Oct) — fixed

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| S-17 | P2 | Email sign-in codes: an address's hourly limit could be used up from other networks, locking its owner out | Past the limit each wider network still gets 2 an hour (BUG-067) |
| S-18 | P2 | Unverified guests could place WhatsApp orders all day from one network (stock held 12 h each) | 12 per network per day (BUG-068); order-size cap = owner decision (OPEN-11) |
| S-19 | P3 | Staff could close refunds | Admin only (BUG-071) |
| S-20 | P3 | Rate limiter: unbounded memory, per-order-id keys, `x-real-ip` trusted off Vercel | BUG-073 |

## 4. Open risks

| ID | Sev | Risk | Evidence | Action |
| --- | --- | --- | --- | --- |
| S-11 (rest) | P2 | 11 advisories (31 Oct; new: `deepmerge` via `@expo/config`) remain in the **phone app's build tooling** (`@expo/cli`, `expo`, `expo-router`, `zod@3` inside `@expo/cli`, `query-string`, `decode-uri-component`). The app itself uses `zod@4.6.7` (not affected). Fixes need an Expo major upgrade (npm suggests SDK 54/58 lines) | `npm audit` in `apps/mobile` | Plan an Expo SDK upgrade and re-test the app; low runtime exposure (tooling) |
| S-12 | P1 (config) | Sign-up/sign-in emails depend on Supabase's built-in mailer (≈2/hour, link instead of code) until custom SMTP + templates are set | owner screenshot; Supabase dashboard | Owner: SMTP + `{{ .Token }}` templates; or set `SMTP_*` env (store sends codes) |
| S-13 | P2 (config) | `CRON_SECRET` unset → cron 401 (safe: cron refuses without it) | live 401 | Owner sets it in Vercel |
| S-14 | P3 | Not-found pages return HTTP 200 (with `noindex`) | local `curl -I` | Deferred |
| S-15 | Info | Live database policies not inspected directly (project not in our Supabase access); they come from the same migrations the build applies | — | Owner can grant read access or run `get_advisors` in Supabase |
| S-16 | Info | Admin accounts: no second factor in the app (Supabase supports MFA) | source review | Optional: enable Supabase MFA for admin accounts |
| S-21 | P3 | Login CSRF: a sign-in/recovery link (`/auth/callback?token_hash=…`) signs the browser in at once, so someone could send their own link and have a victim use the attacker's account | review (round 6) | Add a "Continue as …?" confirmation (POST) before verifying — one extra tap on every email link; decide with the owner |
| S-22 | P3 | Sign-up answers "account already exists" (409), so addresses can be checked | review / existing test | Supabase behaves the same; could send the owner an email instead — product decision |
| S-23 | P3 | Database TLS: `rejectUnauthorized: false` for the Supabase pooler | `lib/db.ts` | Pin Supabase's CA certificate (download from Supabase → Database settings) and test on a preview first |
| S-24 | P3 | Phone app keeps the Supabase session (refresh token) in AsyncStorage, not the secure store (risk on rooted phones; backups are off) | `apps/mobile/src/lib/auth.tsx` | Chunked SecureStore adapter (sessions exceed SecureStore's 2 KB per value) — test on a device |
