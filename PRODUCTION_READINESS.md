# Production Readiness — 4 Nov 2026

## Recommendation

**Code: ready to merge after review** (all checks green; 22 issues fixed; no Critical, no open High in code).
**Store: OK to keep trading on Cash on Delivery / WhatsApp / staff-checked UPI as a soft launch. Not yet ready for a
full public launch with online payments**, because of configuration items only the owner can complete — chiefly the
brand domain's DNS (FB-01), the Vercel plan (FB-11), the duplicate site (FB-09) and the unverified sign-up path (FB-02).

## Final summary

| | |
| --- | --- |
| A. Total issues found | **38** (CONFIRMED 32, POTENTIAL 5, UNVERIFIED 1) |
| B. Critical | **0** |
| C. High | **2** — FB-01 DNS (external), FB-02 sign-up pre-takeover (potential, mitigated) |
| D. Medium | **15** |
| E. Low | **21** |
| F. Issues fixed (this branch) | **22** (FB-03…08, 10*, 13, 18…25*, 27…32; *partial: needs a secret/CA) + FB-17 previously fixed, verified |
| G. Issues remaining | **15** — external 6 (FB-01, 09, 11, 12, 16, 35), needs verification 1 (FB-02), mobile/device 4 (FB-14, 15, 36, 37), code by decision 4 (FB-26, 33, 34, 38) |
| H. Tests passed | 321 automated (52 shared + 269 web) · 3 browser E2E · typecheck, lint, build, mobile typecheck + Android export |
| I. Tests failed | **0** in the final run (2 failures during the work: 1 real bug in my own change — fixed; 1 intended behaviour change — test updated) |
| J. Build status | **PASS** (`npm run build`) |
| K. Security status | No known exploitable Critical/High in code; 3 Medium security issues fixed (peer-admin takeover, email-cap exhaustion, no audit log); mobile token storage + Expo advisories open |
| L. Domain & SSL | `fresh-basket-veg.vercel.app`: HTTPS + HSTS preload + full security headers ✅. `ramsfreshbasket.com`: **attached but DNS points to parking (2.57.91.91) → not serving, no certificate** ❌. Duplicate `fresh-basket-brown.vercel.app` self-canonical ❌ |
| M. Server configuration | Vercel **Hobby** (commercial use not allowed; daily cron only; 1 h logs) ❌ · region `iad1` vs unknown DB region ⚠️ · `CRON_SECRET` set ✅ · production errors since PR #30: none ✅ |
| N. Database | Migrations reviewed; RLS everywhere; two new additive, reversible migrations (ledger, audit, UTR hold, indexes, column grants) — **auto-applied on merge** ⚠️ backup first. Live DB not inspectable from here (UNVERIFIED) |
| O. Payment status | Server-side verification sound (HMAC + fetch + amount/currency + once-only events); new: total-shown guard, UTR orders kept for review, webhook captured/INR check, GET page can't cancel. **Razorpay not configured in production** (online payment off) |
| P. Launch recommendation | Merge → owner checklist below → then full launch. Enable online payments only after a Razorpay test-mode run on Preview |

## Owner checklist (in order)

| # | Action | Where | Fixes |
| --- | --- | --- | --- |
| 1 | Back up the database, review and merge this branch | Supabase Backups / `pg_dump`; GitHub PR | — |
| 2 | Point DNS of `ramsfreshbasket.com` to Vercel (A `216.198.79.1`, CNAME `www` → `cname.vercel-dns.com`) | Hostinger hPanel → DNS | FB-01 |
| 3 | Choose the primary domain; set `NEXT_PUBLIC_APP_URL`, redirect the others, update Supabase auth URLs, Razorpay webhook, app URL | Vercel, Supabase, Razorpay | FB-09 (see DOMAIN_SERVER_AUDIT §4) |
| 4 | Delete the `fresh-basket` (brown) project or point its canonical at the primary | Vercel | FB-09 |
| 5 | Upgrade the team to Vercel Pro; then optionally cron `*/10 * * * *` | Vercel → Billing | FB-11, FB-10 |
| 6 | Check the Supabase region; set `regions` to `bom1`/`sin1` accordingly | Supabase → Settings → General; `apps/web/vercel.json` | FB-12 |
| 7 | GitHub Actions secret `CRON_SECRET` + variable `SITE_URL`; run the workflow once | GitHub → Settings → Actions | FB-10 |
| 8 | Live sign-up test with a throwaway email: the 6-digit code arrives from the store mailbox | live site | FB-02 |
| 9 | `ADMIN_EMAILS` = owner address(es) only | Vercel env | FB-06 |
| 10 | (Online payments) Razorpay test keys on Preview → full test → live keys on Production, webhook, auto-capture ON | Razorpay, Vercel | FB-16, FB-35 |
| 11 | `DATABASE_CA_CERT` on Preview → Production | Supabase SSL config, Vercel | FB-25 |
| 12 | Grant read access to the live Supabase project for the next audit (advisors, live RLS) | Supabase → Team | UNVERIFIED items |
| 13 | Still open from earlier audits: legal details (Admin → Settings → Legal), support contacts, licensed product photos for 16 products, delivery-area data fixes, Organic Potato price | Admin panel | OPEN-01/03/04/05/06 |
| 14 | Mobile before store release: Expo SDK 58, encrypted session storage, device test | Dev | FB-14, FB-15, FB-36, FB-37 |
