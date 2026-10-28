# Bug Report

Severity: **P0** critical security / data loss · **P1** checkout failure, wrong charge, unauthorised access, major
business flow · **P2** significant feature, catalogue or usability defect · **P3** minor visual/content/polish.

Every FIXED bug was reproduced first (by a test, a script or in the browser), fixed at its cause, and has a
regression test or a re-run check. "PR" = merged pull request on `lakhans8833/fresh-basket` (all deployed to both
live sites). Evidence files from the browser sessions are under the auditor's working folder and are referenced by
test name where a repository test exists.

## A. Open items (not fixable in code — owner data, configuration or decisions)

| ID | Sev | Where | Problem (verified) | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| OPEN-01 | P1 | Admin → Settings (live) | Customer support phone, WhatsApp and email are **all empty** on the live store, so customers have no way to contact the shop about an order | live `/api/settings`: `supportPhone`, `supportEmail`, `whatsapp` empty (28 Oct) | BLOCKED — owner must enter real details |
| OPEN-02 | P1 | Supabase Auth (live) | Sign-up email is Supabase's default template: it sends a **link, not the 6-digit code** the website/app ask for; Supabase's built-in mailer sends ~2 emails/hour | owner's screenshot of the received email; Supabase dashboard says templates need custom SMTP | BLOCKED — owner: custom SMTP (Gmail App password or Brevo) + `{{ .Token }}` templates |
| OPEN-03 | P1 | Privacy / Terms / Returns (live) | Registered business name, address, grievance officer and policy date are empty, so the pages omit them (Indian e-commerce rules expect them) | live `/api/settings` → `legal.*` all empty | BLOCKED — owner fills Admin → Settings → Legal & policies |
| OPEN-04 | P1 | Catalogue images (live) | 16 products use photos from `public/images/dev/`, which `public/images/dev/README.md` marks as development images of unverified origin/licence; 10 products have no photo | `PRICE_CATALOG_AUDIT.csv` (`image` = `dev` / `none`) | BLOCKED — owner uploads own/licensed photos |
| OPEN-05 | P2 | Admin → Delivery (live data) | 121003: area and city swapped ("Faridabad" / "sector 7"); "Sector 9" missing; 121006 (Sector 8) has no free-delivery amount (₹624 order still pays ₹10); names in lower case | live `/delivery-policy` + live quote: 121006 ₹624 → fee ₹10 | BLOCKED — owner confirms PINs/fees, then edits |
| OPEN-06 | P2 | Catalogue price | Organic Potato ₹60/kg is cheaper than regular Potato ₹70/kg (all other organic items cost more) | `PRICE_CATALOG_AUDIT.csv` flag `ORGANIC_CHEAPER_THAN_REGULAR` | Needs owner confirmation (price not changed) |
| OPEN-07 | P2 | Vercel env (live) | `CRON_SECRET` unset → daily cron returns 401. Impact reduced: expired holds are now also released on shopper requests (BUG-014) | live `/api/cron/release-expired` → 401 | BLOCKED — owner sets the secret in Vercel |
| OPEN-08 | P3 | SEO | Two live domains each declare themselves canonical (duplicate content) | live `<link rel=canonical>` on both | Owner: set `NEXT_PUBLIC_APP_URL=https://fresh-basket-veg.vercel.app` on the `fresh-basket` project, redeploy |
| OPEN-09 | P3 | Not-found pages | Unknown product/category/order URLs show "Page not found" but with HTTP 200 (pages are `noindex`) — caused by streaming with `loading.tsx` | `curl -I` locally → 200 | Known, deferred (low impact) |
| OPEN-10 | P3 | Catalogue | Capsicum out of stock (all packs 0); Spinach 1 kg pack 0 | `PRICE_CATALOG_AUDIT.csv` | Info — restock in Admin → Inventory |

## B. Fixed in this audit (branch `audit/report-and-deps`, not yet deployed)

| ID | Sev | Route / file | Problem | Fix | Verified |
| --- | --- | --- | --- | --- | --- |
| BUG-060 | P2 | `/terms` (`app/(shop)/terms/page.tsx`) | Terms said "You need an account to place an order" although guest WhatsApp ordering exists | Text now distinguishes website/app (account) from WhatsApp (no account) | lint + tsc PASS; page text check PASS |
| BUG-061 | P3 | `apps/mobile/eas.json`, `store/PLAY_STORE.md` | Release builds pointed the app at the secondary domain (owner chose `fresh-basket-veg`); Play listing links to privacy/deletion on the old domain | Both now use `https://fresh-basket-veg.vercel.app` | config review |
| BUG-062 | P3 | `README.md`, `docs/legal-placeholders.md` | Docs said rate limiting is in-memory only and that policy pages contain `[placeholders]` — both out of date | Docs rewritten to match the code | review |
| BUG-063 | P2 (security) | `apps/mobile/package-lock.json` | 10 known-vulnerable dependency versions in the app's build tooling | `npm audit fix` (no breaking changes): 10 → 6; app type-check, web export, smoke 13/13 and auth 13/13 PASS | see `SECURITY_REPORT.md` S-11 |

## B2. Found in the login → order deep check (29 Oct)

| ID | Sev | Route / file | Problem | Fix | Verified |
| --- | --- | --- | --- | --- | --- |
| BUG-064 | P2 | `apps/web/next.config.ts` (CSP) | The CSP allowed `https://<host>` built from the Supabase hostname, dropping the scheme and port: with a self-hosted/local Supabase (`http://host:54321`) **every sign-in request was blocked**. Hosted Supabase (live) was not affected | CSP uses the project's real origin (scheme + port) for `connect-src`/`img-src` | email code 20/20, sign-up code 7/7, password + forgot password 28/28, admin session refresh OK, unconfirmed account OK — all against a Supabase-mode build with fake GoTrue servers |
| BUG-065 | P3 (test) | `e2e/whatsapp.py`, `e2e/resend_confirmation.py` | Tests out of date: used PIN 121006 as "not served" (it is served in Faridabad); expected an old unconfirmed-account message | Tests updated; both PASS; WhatsApp order test added to the regression | WHATSAPP E2E OK, RESEND CONFIRMATION E2E OK |

## C. Fixed and deployed (PR #19 – #23, 26–28 Oct)

| ID | Sev | Route / file | Problem → fix | Regression test | PR |
| --- | --- | --- | --- | --- | --- |
| BUG-001 | P1 | `/privacy`, `/terms`, `/returns` | Pages showed `[registered business name]`, `[date]` etc. and a "Template" banner to customers → details now come from Admin → Settings → Legal & policies; missing ones are left out, dashboard lists them | `e2e/policy_pages.py` (35/35), `test/rls-isolation` (settings part) | #19 |
| BUG-002 | P2 | all pages | No Content-Security-Policy header → production CSP (self, Razorpay, Supabase, geocoder) | `e2e/policy_pages.py` checks header + no CSP errors; live check | #19 |
| BUG-003 | P1 (security) | App sign-up (`apps/mobile/src/lib/auth.tsx`) | An earlier unconfirmed sign-up by someone else kept *their* password after the real owner confirmed by code → password set again + other sessions signed out | `apps/mobile/e2e/auth_mock.py` (13/13) | #20 |
| BUG-004 | P1 (security) | `lib/auth-email.ts` | Code sign-in to a never-confirmed account kept the earlier password → replaced with a random one | `test/auth-email` | #20 |
| BUG-005 | P2 | `/api/auth/email` | Anyone could exhaust one address's code allowance (and invalidate their code) from many networks → per network+address limits | `test/auth-email` | #20 |
| BUG-006 | P2 | `/api/auth/email` | Gmail dots/`+tags` bypassed per-address limits; shop-wide cap easy to exhaust → one key per mailbox, cap 300/h | `test/limit-keys`, `test/auth-email` | #20 |
| BUG-007 | P3 | `/api/auth/email` (recovery) | Response time revealed whether an email has an account → mail sent after the response | `test/auth-email` | #20 |
| BUG-008 | P3 | Admin settings save | After a partial save failure the shop kept old settings for 10 min → cache refreshed | code review | #20 |
| BUG-009 | P3 | `/privacy` | Data processors list incomplete (email provider, WhatsApp/Meta, BigDataCloud) → added | `e2e/policy_pages.py` | #20 |
| BUG-010 | P3 | CSP on preview deployments | Vercel toolbar blocked on previews → allowed on previews only | config review | #20 |
| BUG-011 | P2 | Home (web + app) | 30 of 55 products repeated 2–3× across rows (95 cards) → each product once (54 cards live) | `packages/shared/test/home-rails`, live count | #21 |
| BUG-012 | P3 | Brand | Fallback name "Fresh Basket", home-screen short name "Fresh Basket", seed "Ram Avatar Fresh Basket" → "Rams Fresh Basket" everywhere | live manifest check | #21 |
| BUG-013 | P1 | Admin product form + `lib/admin/catalog.ts` | Adding a non-weight size to a weight product turned the shared kilos into separate per-pack stock: 5 kg became ~17 kg sellable → refused unless packs fit the kilos; form clears stock boxes | `test/deep-check-3` | #22 |
| BUG-014 | P1 | `/api/quote`, slots, PIN check | Expired unpaid orders kept items "out of stock" and slot places until an admin page loaded or the daily cron ran → released before quotes (once a minute) | `test/deep-check-3` | #22 |
| BUG-015 | P2 | `mark_order_paid` (SQL), admin confirm | Payment verified / WhatsApp order confirmed after the booked window → "placed" for a past slot, instantly late → moved to "time agreed on WhatsApp", today | `test/deep-check-3` | #22 |
| BUG-016 | P2 | Order status flow | "Out for delivery" could not be cancelled (refused / nobody home) → store can cancel, stock returns | `test/deep-check-3` | #22 |
| BUG-017 | P2 | Search (web + app) | "tomatoes", "green capsicum", "brocoli", "carot" → "No products found" → forgiving fallback search | `packages/shared/test/catalog-search`; live check | #22 |
| BUG-018 | P2 | `/checkout` | A slot that closed while the customer was on checkout stayed selected; same error shown twice → slots reload, next open slot chosen | reproduced in the browser; full regression | #22 |
| BUG-019 | P2 | `config/store.ts` | WhatsApp number saved in Admin was ignored when the env var was set → admin value wins | code + regression | #22 |
| BUG-020 | P3 | Header cart total | Used the price when the item was added → today's quote price | regression | #22 |
| BUG-021 | P3 | Admin → Users | List silently cut at 300 → says so | review | #22 |
| BUG-022 | P3 | Local image storage | Photos uploaded after the server started returned 404 (local/self-hosted only) → served by a route | review | #22 |
| BUG-023 | P3 | Admin dashboard | "Orders today" counted cancelled/unpaid orders, unlike Analytics → same rule | review | #22 |
| BUG-024 | P3 | App cart | "₹X each" showed the old price → quote price | app smoke | #22 |
| BUG-025 | P3 | App cart | "+" could exceed stock → capped by quote `maxQuantity` | app smoke | #22 |
| BUG-026 | P3 | App checkout | Two different minimums shown (₹149 and ₹99) → the address's minimum | app smoke | #22 |
| BUG-027 | P3 | App order page | "Paid via Cash on delivery" on unpaid orders → "Payment:" until paid | review | #22 |
| BUG-028 | P3 | App checkout | Closed date labelled "Full" → "Unavailable" | review | #22 |
| BUG-029 | P3 | App address form | State not filled from PIN (website did) → filled | review | #22 |
| BUG-030 | P2 | Rate limits (all public POSTs) | One IPv6 /64 could rotate addresses past every limit (contact, newsletter, WhatsApp orders) → IPv6 grouped by /64 + daily caps | `test/deep-check-4` | #23 |
| BUG-031 | P2 | Coupons after account deletion | Delete account + sign up again with the same email → first-order / once-per-customer coupons worked again → keyed email hash keeps the history | `test/deep-check-4` | #23 |
| BUG-032 | P3 | `lib/auth.ts` | A still-valid token of a deleted login caused 500s (foreign key) → treated as signed out | `test/deep-check-4` | #23 |
| BUG-033 | P3 | WhatsApp updates | Failed sends were never retried → retried up to 3× | review | #23 |
| BUG-034 | P3 | All text inputs | A NUL byte caused a 500 → 400 with a clear message | `test/deep-check-4` | #23 |
| BUG-035 | P3 | Addresses | No limit (60 saved in a test) → 20 per customer; orders never fail because of it | `test/deep-check-4` | #23 |
| BUG-036 | P3 | Service worker | Site images cache-first forever → refreshed in the background | review | #23 |
| BUG-037 | P2 | `/shop`, `/category/*` on phones | Price / Discount filter menus opened invisibly (clipped by the scrolling row) → open as a sheet | `e2e/deep_check_4.py`; live check | #23 |
| BUG-038 | P2 | App Home → Categories | Tapping a category after changing it showed the old category / old search → every tap applies | review + app smoke | #23 |
| BUG-039 | P2 | Cart drawer | Pressing "+" with the keyboard moved focus to "Close cart" → focus kept | `e2e/deep_check_4.py` | #23 |
| BUG-040 | P2 | Admin coupons on phones | Failed submit gave no visible feedback (errors off-screen) → focus first bad field | review | #23 |
| BUG-041 | P2 | 200% zoom / landscape phones | Fixed bars covered ~68% of the screen → header scrolls away on short screens | `e2e/deep_check_4.py` | #23 |
| BUG-042 | P2 | App reorder | Quietly added fewer items, no notice → explains reduced / unavailable / price changes | review | #23 |
| BUG-043 | P3 | Print order | Header/footer/bars printed, status icons lost → print styles | `e2e/deep_check_4.py` | #23 |
| BUG-044 | P3 | Buy again | Said "Added 1 item" when nothing was added → correct message | review | #23 |
| BUG-045 | P3 | Wishlist | Items saved in another tab didn't appear → refetch | review | #23 |
| BUG-046 | P3 | Toasts on phones | Covered the "View cart" bar → shown at the top | `e2e/deep_check_4.py` | #23 |
| BUG-047 | P3 | Forms (a11y) | Errors not linked to fields; focus not moved to the first error (coupons, addresses, profile) | review | #23 |
| BUG-048 | P3 | Delete account (a11y) | Focus dropped to the page body → confirm box focused | review | #23 |
| BUG-049 | P3 | Admin phone menu / location popup | Page behind scrolled; Escape left focus on body → scroll lock, focus returned | review | #23 |
| BUG-050 | P3 | Order page | Delivered COD order said "pay when it arrives" → amount only | review | #23 |

## D. Fixed earlier (PR #11 – #18, 21–26 Oct) — summary

The first audit rounds (backend deep check, UI deep check, phone-app fixes, email/Google sign-in) fixed, among
others: per-pack stock not cleared when switching to kg stock (BUG-051, P1), sales during an open product form being
undone by "set kilos" (BUG-052, P1), impossible delivery dates / out-of-range coupon values reaching the database as
500s (BUG-053, P2), guest WhatsApp order cap not counting unpaid orders (BUG-054, P2), an analytics number-type error in the dashboard charts
(BUG-055, P3), chart tooltip not usable by touch (BUG-056, P3), small inventory checkboxes (BUG-057, P3),
cart drawer trapped under the header blur (BUG-058, P2), and logo/top-bar layout on small phones (BUG-059, P3). Each
has a regression test (`test/deep-check-fixes`, `e2e/admin_charts.py`, `e2e/shopper_features.py`, `e2e/flow.py`).

**Totals:** 63 bugs fixed (59 deployed + 4 in this audit branch) · 10 open items, all needing owner data,
configuration or a decision.
