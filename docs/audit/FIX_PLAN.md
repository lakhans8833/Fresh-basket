# Fix Plan

All confirmed code bugs are fixed (see `BUG_REPORT.md`). What remains is ordered by impact on a real launch.
"Owner" = needs the store owner's data, accounts or decision; "Dev" = code work.

## Priority 1 — before taking real customers (P1)

| # | Item | Who | Steps | Depends on | Check after |
| --- | --- | --- | --- | --- | --- |
| 1 | Customer contact details (OPEN-01) | Owner | Admin → Settings → Customer support: phone, WhatsApp (91XXXXXXXXXX), email, hours → Save | — | Live footer/contact/order pages show them; `e2e` not needed |
| 2 | Email codes for sign-up / sign-in (OPEN-02, S-12) | Owner | Supabase → Authentication → Emails → SMTP (Gmail App password or Brevo) → templates "Confirm signup" + "Magic Link" with `{{ .Token }}` → raise "emails per hour" in Rate Limits | Gmail 2-Step Verification | Sign up with a new address: a 6-digit code arrives |
| 3 | Legal identity (OPEN-03) | Owner (+ legal adviser) | Admin → Settings → Legal & policies: registered name, address, GSTIN/FSSAI, grievance officer + email, courts, date | — | `/privacy`, `/terms`, `/returns` show them; dashboard notice disappears |
| 4 | Product photos (OPEN-04) | Owner | Replace the 16 development photos and add the 10 missing ones (Admin → Products → Upload photo) | Own or licensed photos | `PRICE_CATALOG_AUDIT.csv` `image` column = `own` everywhere |
| 5 | Phone app release build | Owner/Dev | Merge this branch (app points at `fresh-basket-veg`), then `npx eas-cli build --platform android --profile preview`; test on a real phone | Expo account | Login, cart, checkout, orders work on the device |

## Priority 2 — first week

| # | Item | Who | Steps | Check after |
| --- | --- | --- | --- | --- |
| 6 | Delivery areas (OPEN-05) | Owner | Admin → Delivery: 121003 → "Sector 7" / "Faridabad"; add Sector 9 (PIN, fee, minimum, free above); 121006 free-above; capitalise names; confirm every PIN | Live `/delivery-policy` + a quote per PIN |
| 7 | Organic Potato price (OPEN-06) | Owner | Confirm ₹60/kg vs regular ₹70/kg; correct in Admin → Products if wrong | `PRICE_CATALOG_AUDIT.csv` flag gone |
| 8 | `CRON_SECRET` (OPEN-07, S-13) | Owner | Vercel → both projects → Environment Variables → `CRON_SECRET` (long random) → Redeploy | Vercel cron log shows 200 |
| 9 | One main domain (OPEN-08) | Owner | Vercel → `fresh-basket` project → `NEXT_PUBLIC_APP_URL=https://fresh-basket-veg.vercel.app` → Redeploy | Canonical on brown points to veg |
| 10 | Server region | Owner/Dev | If the Supabase database is in Mumbai/Asia, set the Vercel function region to `bom1` (now `iad1`, USA) — first visits wait ~2 s | Live TTFB on a cold start |

## Priority 3 — when convenient

| # | Item | Who | Notes |
| --- | --- | --- | --- |
| 11 | Expo SDK upgrade (S-11) | Dev | Clears the 6 remaining build-tool advisories; re-run app smoke/auth tests and a device build |
| 12 | Stock movement history | Dev | Append-only inventory log (who, when, reason, before/after, order) — useful for shrinkage/spoilage; today stock edits apply only the change since the form opened but keep no history |
| 13 | Not-found status 200 (OPEN-09) | Dev | Return 404 for unknown product/category/order pages (move `notFound()` before streaming starts) |
| 14 | Saved items screen in the app | Dev | The ♥ works but the app has no list screen (website has `/wishlist`) |
| 15 | Admin 2-step sign-in (S-16) | Owner | Enable Supabase MFA for admin accounts |
| 16 | ~~Flaky unit test~~ | Dev | Solved 30 Oct: a test picked Tomato at random and emptied its stock for the next tests (see `TEST_PLAN.md` §4) |

## Regression tests to keep running

`npm test` (web 216 + shared 52), `npm run build`, and the browser suites listed in `TEST_PLAN.md` — especially
`e2e/flow.py`, `e2e/checkout_retry.py`, `e2e/policy_pages.py`, `e2e/deep_check_4.py`, `apps/mobile/e2e/smoke.py`,
`apps/mobile/e2e/auth_mock.py`.
