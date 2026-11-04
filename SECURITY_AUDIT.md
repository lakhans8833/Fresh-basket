# Security Audit — 4 Nov 2026

Scope: authentication & sessions, admin authorisation, API input handling, payments, database grants/RLS/functions,
uploads, secrets, mobile app. Method: source review of every route under `apps/web/src/app/api/**` and the SQL in
`supabase/migrations/**`, proofs against a local database built from the real migrations (two customers, staff,
admins, anon as real Postgres roles), and read-only checks of the Vercel configuration. **No secret values were read
or printed; no production data was touched; no real payments or emails were sent.**

IDs refer to `AUDIT_REPORT.md`. Status: CONFIRMED / POTENTIAL / FIXED / PARTIAL / OPEN / EXTERNAL / UNVERIFIED.

## 1. Result

| | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- |
| Security findings | 0 | 1 (FB-02, potential, mitigated) | 3 fixed (FB-05, FB-06, FB-07) + 2 open mobile (FB-14, FB-15) | 6 fixed/partial (FB-20, 22, 23, 24, 25, 27) + 1 open (FB-38) |

**Security status: no known exploitable Critical/High issue in code.** The remaining High item (FB-02) is likely
closed in production by the SMTP configuration but has not been verified with a live sign-up.

## 2. Requirements checklist

| Requirement | Result | Evidence |
| --- | --- | --- |
| Customers access only their own personal data | PASS | `rls-isolation` suite (two customers + anon); `getMyOrder` filters by `auth.uid()` |
| Customers can't read other customers' orders | PASS | RLS + IDOR tests (`orders.integration`: other user → 404) |
| Customers can't modify payment status | PASS | no write grants on `orders`/`payments`; `mark_order_paid` EXECUTE revoked; `security-payments` suite |
| Customers can't manipulate prices | PASS | clients send only variant ids + quantities; server quote under lock; **new:** total must match what was shown (FB-03) |
| Admin-only operations protected on the server | PASS | all 31 admin handlers call `requireAdmin`/`requireStaff`; staff vs admin split (prices, refunds, UPI confirm) |
| Admins can't take over other admins | **FIXED** (FB-06) | owner-only check, 4 new tests |
| Audit logging without secrets | **FIXED** (FB-07) | `admin_audit_log` has no body/secret columns (asserted in test) |
| Public users can't access internal tables | PASS | RLS on all 25 public tables; new tables `stock_movements`, `admin_audit_log` revoked from anon/authenticated (tested) |
| Internal columns hidden from customers | **FIXED** (FB-20) | column grants; test |
| Storage uploads validated | PASS | type sniffed from bytes (JPEG/PNG/WebP), 5 MB, random names, admin-only writes, path-checked serving with `nosniff` |
| Profile identity not editable by unauthorised users | PASS | customers may update only `full_name`, `phone` (`20261017000010_profile_identity_lockdown`); role trigger |
| SQL injection | PASS | parameterised queries; dynamic identifiers only from fixed lists / `quote_ident`/`format('%I')` |
| SECURITY DEFINER functions | PASS | fixed `search_path`; money/stock functions not executable by anon/authenticated; new trigger functions revoked |
| Service-role key never in the browser | PASS | `server-only` modules; no `'use client'` file imports server code; only `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` exposed (public by design) |
| OTP generated securely / expires / single use | PASS | store-sent codes come from Supabase `generateLink` (Supabase's OTP: expiry + single use); app tokens HMAC with purpose binding, timing-safe compare |
| OTP rate limiting | PASS + **FIXED** (FB-05) | per /64, per network+address, per address, **new per /48**, shop-wide |
| Session cookies secure | **FIXED** (FB-23) | `Secure` on HTTPS (they can't be `httpOnly`: the browser client reads them) |
| Redirect URLs validated | PASS | `safeNextPath` (`//`, `\`, control chars, dot segments) — `test/safe-next` |
| Protected pages | PASS | admin layout + APIs gated; account pages redirect to login |
| Tokens not in URLs/logs | PASS with note | email links carry Supabase `token_hash` (by design, one-time); proxy never forwards tokens on error redirects; logs use order ids, no OTPs/phones |
| Razorpay: server-side verification only | PASS | HMAC on checkout + webhook raw body, payment fetched from Razorpay, amount/currency/order match, events stored once; **new:** webhook checkout path requires captured INR (FB-22) |
| Cron endpoint protected | PASS | `Bearer CRON_SECRET`, constant-time, fails closed (`CRON_SECRET` is set for Production + Preview) |

## 3. Findings in detail

### FB-02 · High · POTENTIAL · account pre-takeover via Supabase's own confirmation path
An attacker signs up with the victim's email and a password. If the victim later confirms that account through
**Supabase's** mailer (default confirmation link, or `signInWithOtp` code), the account becomes confirmed with the
attacker's password still set. The store's own SMTP path (`lib/auth-email.ts`) already replaces the password (fix
S-01, PR #20) — but only runs when `emailCodesBySmtp()` is true.
- **Production config (names only, 4 Nov):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
  `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET` are all set → the SMTP path should be active. **UNVERIFIED** live.
- **Fixed now:** Admin → Users → "Confirm email" had the same weakness (it kept whatever password the account had);
  it now sets a random password and ends sessions (the customer signs in by email code / "Forgot password").
- **To close fully (owner):** after merge, sign up with a throwaway address on the live site and confirm the code
  arrives from the store's mailbox (not Supabase). Optionally disable Supabase's built-in signup emails. A database
  trigger on `auth.users` (clear password on first confirmation) was considered and **not** applied: it can't be
  tested here against real GoTrue and would break password sign-ups confirmed by link.

### FB-05 · Medium · FIXED · email-code allowance exhaustion
Reviewer repro: 31 × /64 from one /48 × 10 requests → `{200: 300, 429: 10}`, then a normal customer → **429**.
Fix: 60/h per /48 before the 300/h shop cap. Residual: an attacker with ≥ 5 separate /48s (cheap on cloud providers)
can still exhaust the cap → **recommended (EXTERNAL):** Cloudflare Turnstile (free) on the email-code form after N
requests per network, and an alert when the shop cap is hit.

### FB-06 · Medium · FIXED · peer-admin takeover
Reviewer repro: second admin changed the owner's email (auto-confirmed) and demoted them; no record anywhere.
Fix: owner = confirmed `auth.users` email in `ADMIN_EMAILS` (the deploy already promotes these). Non-owners get 403
for email/role/reset-link/password actions on another admin. If `ADMIN_EMAILS` is empty, such changes must be done in
the Supabase dashboard. **Owner action:** keep `ADMIN_EMAILS` = the real owner address(es) only.

### FB-07 · Medium · FIXED · admin audit log
`public.admin_audit_log(created_at, actor_id, actor_role, method, path, status)`. Read it in Supabase SQL editor:
`select * from admin_audit_log order by created_at desc limit 100;`. It is written after the response is computed
(best effort, not in the same transaction as the change) — a database outage could drop an entry, never an action.

### FB-20 · Low · FIXED · column-level exposure
RLS limited rows but `grant select on all tables … to authenticated` exposed every column of the customer's own
rows through the Supabase API, incl. `order_events.actor` (`admin:<uuid>`), `order_adjustments.created_by/done_by`,
`orders.idempotency_key/request_fingerprint/payment_prep_token`. Now column grants without those.
**Developer note:** a column added to these three tables later is not readable by `authenticated` until granted —
add `grant select (new_col) on public.orders to authenticated;` in that migration if customers need it.

### FB-23 · FB-24 · FB-25 · Low · cookies / recovery mode / DB TLS
See `BUG_FIX_REPORT.md`. Still OPEN from S-21: an emailed sign-in link signs the browser in on GET, so someone can
send their own link and have a victim use the attacker's account (login CSRF; the account email is shown). Full fix =
"Continue as <email>?" confirmation page + POST — one extra tap on every email link; product decision.

### FB-14 · FB-15 · FB-36 · FB-37 · Mobile (OPEN)
Session in AsyncStorage (move to encrypted storage with a SecureStore key); 17 npm advisories (6 high) needing the
Expo SDK 58 upgrade; `Math.random` idempotency fallback; deep-link edge cases. All need a device build to verify.

## 4. Recommended next security steps (in order)

1. Merge this branch (review the two migrations — they are applied automatically on the production deploy).
2. Live sign-up test (FB-02); confirm `ADMIN_EMAILS` lists only owners.
3. Turnstile on the email-code form (FB-05 residual).
4. `DATABASE_CA_CERT` on Preview, then Production (FB-25).
5. Expo SDK 58 upgrade + encrypted session storage (FB-14/15) before publishing the app.
6. Enable Supabase MFA for admin accounts (S-16, still optional/open).
7. Ask for read access to the live Supabase project (`dhtkqanvrnuyykslxdfs`) and run Supabase's security advisor —
   live policies were verified only via the migrations the build applies (UNVERIFIED live).
