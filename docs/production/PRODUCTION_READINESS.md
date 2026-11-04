# Production Readiness (5 Nov 2026)

## Summary
| | |
|---|---|
| A. Total issues found (all rounds) | 107 code issues + 11 owner/configuration items |
| B. Critical (open) | 0 |
| C. High (open) | 0 in code. External: legal identity (OPEN-03), product photos (OPEN-04) |
| D. Medium (open) | Code: R8-11 Razorpay capture (only when online payments are enabled). External: delivery-area data (OPEN-05), duplicate host env (OPEN-08 step), guest order cap (OPEN-11) |
| E. Low (open) | R8-12 slot-end on edited slots, R8-13 partial COD amount, OPEN-09 404 status |
| F. Issues fixed | 107 (97 earlier + 10 this round) |
| G. Issues remaining | 3 low/medium code items (documented, reasons given) + owner items |
| H. Tests passed | All suites in `TEST_RESULTS.md` (261 web unit, 52 shared, every e2e) |
| I. Tests failed | 0 (one test-script locator fixed and re-run) |
| J. Build | PASS (local); Vercel production builds green for PR #30–#35 |
| K. Security | No open Critical/High; see `SECURITY_AUDIT.md` |
| L. Domain / SSL | `fresh-basket-veg.vercel.app` OK (https). `ramsfreshbasket.com` bought and added to Vercel; **DNS not yet pointed** (owner, Hostinger) |
| M. Server configuration | OK (region matches DB, cron + secret set, migrations prod-only). Brown project needs `NEXT_PUBLIC_APP_URL` |
| N. Database | Migrations add-only; RLS on every table; new audit log + stock ledger; backups: owner to confirm plan and keep a `pg_dump` |
| O. Payments | Cash on delivery live and tested. Online payments **off**; before enabling: Razorpay test keys, auto-capture, then live keys |
| P. Launch recommendation | **Ready to take COD orders** on `fresh-basket-veg.vercel.app` once round 8 is deployed. Before a public launch: fill the legal details, replace development photos, fix delivery-area data, point the custom domain |

## Owner checklist before the public launch
1. Admin → Settings → Legal & policies: registered name, address, grievance officer + email, date.
2. Product photos: replace 16 development photos, add the missing ones (own or free-licensed).
3. Admin → Delivery: confirm every PIN, area names, fees, free-delivery amounts (121006 has none).
4. Hostinger DNS for `ramsfreshbasket.com` → then `NEXT_PUBLIC_APP_URL` on both projects + Supabase redirect URLs.
5. Project `fresh-basket`: `NEXT_PUBLIC_APP_URL`, then redeploy (removes the duplicate site).
6. Decide the maximum guest WhatsApp order (OPEN-11).
7. 2-step verification on Gmail, Hostinger, Vercel, GitHub, Supabase.
8. Clear the old open orders in Admin → Orders (past delivery dates; test orders).
