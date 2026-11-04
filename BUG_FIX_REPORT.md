# Bug Fix Report — audit/production-readiness (4 Nov 2026)

Every fix below was reproduced first (or the code path is unambiguous), fixed at the cause, and verified by a test
or a re-run. IDs match `AUDIT_REPORT.md`. Test evidence: `TEST_RESULTS.md`.

## Files changed

| Area | Files |
| --- | --- |
| Orders & payments | `apps/web/src/lib/orders.ts`, `lib/payments/{process,start,upi}.ts`, `app/(shop)/pay/[id]/page.tsx`, `packages/shared/src/schemas.ts`, `components/cart/{checkout-view,whatsapp-order-view}.tsx` |
| Security | `lib/admin/users.ts`, `app/api/admin/users/[id]/route.ts`, `components/admin/users-manager.tsx`, `app/api/auth/email/route.ts`, `app/auth/callback/route.ts`, `proxy.ts`, `lib/auth.ts`, `lib/client/supabase.ts`, `lib/db.ts`, `scripts/migrate.mjs` |
| Admin & inventory | `lib/http.ts`, **new** `lib/admin-audit.ts`, `lib/db.ts` (`labelStockChange`), `lib/admin/{catalog,adjustments,orders}.ts`, `components/admin/{inventory-table,dashboard}.tsx` |
| Database | **new** `supabase/migrations/20261104000001_stock_movements_admin_audit.sql`, **new** `20261104000002_utr_hold_fk_indexes_column_grants.sql`, regenerated `supabase/all-migrations.sql` |
| SEO / infra | **new** `lib/structured-data.ts`, `app/(shop)/page.tsx`, `app/robots.ts`, **new** `.github/workflows/release-expired-holds.yml` |
| Mobile | `apps/mobile/src/lib/config.ts`, `src/lib/cart.tsx`, `src/app/orders/[id].tsx`, `src/app/checkout.tsx` |
| Tests | **new** `test/production-readiness.integration.test.ts` (9), **new** `test/structured-data.test.ts` (3); extended `test/admin-edit-user.integration.test.ts` (+4), `test/auth-callback.test.ts` (+1); updated `test/orders.integration.test.ts` (expected status 409 → 403, see FB-06) |

## Fixes

### FB-03 · Medium · Order placed at a total the customer never saw
- **Repro:** quote 4 × tomato 500 g = ₹153; admin doubles the price; `placeOrder(cod)` → order saved at ₹281, no error.
- **Fix:** `expectedTotal` (optional, paise) in `placeOrderSchema` + `whatsappOrderSchema`; `insertOrder` compares it
  with the locked server quote and throws `409 PRICE_CHANGED` (details: new total). Web checkout and the WhatsApp
  page re-quote on that code; the app already re-quotes on any 409. Guests' WhatsApp orders omit it when a cart coupon
  is present (the server ignores guest coupons, so the shown total would never match).
- **Test:** `production-readiness › PRICE_CHANGED` — wrong total refused, no order row created; correct total placed
  with the same idempotency key; request without the field still works. Browser E2E `flow.py`, `checkout_retry.py`,
  `whatsapp.py` pass with the field sent.

### FB-04 · Medium · UPI order with a reported UTR cancelled as "payment failed"
- **Repro:** UTR submitted → hold expired → `cancelled / failed`; customer cancel after UTR → `cancelled / failed`;
  dashboard showed nothing.
- **Fix:** `release_expired_reservations()` skips UPI orders with a UTR for 48 h after `upi_reference_at`
  (otherwise identical, same lock order); `customerCancel` refuses (`409 UPI_CLAIMED`) while the UPI payment is still
  unconfirmed; `adminStats.upiToCheck` + dashboard tile "UPI payments to check".
- **Bug found by the suite during this fix:** my first guard also blocked cancelling a UPI order that staff had
  already confirmed as paid (the UTR stays on the order) — caught by `order-lifecycle › UPI paid → customer cancels`;
  the guard now applies only while `payment_status = 'pending'`.
- **Test:** `production-readiness › UPI orders with a reported UTR` (held, counted, not self-cancellable, expires
  after 48 h; UPI without UTR still expires).

### FB-05 · Medium · One network could exhaust the shop-wide email-code cap
- **Fix:** `auth-email:net-hour:<ipv6 /48>` 60/h before `auth-email:shop-hour` 300/h. IPv4 is already limited per
  address (10 / 10 min).
- **Test:** existing `auth-email` suite passes (no change for normal use). Residual: 5+ /48s can still reach the shop
  cap → CAPTCHA recommended (SECURITY_AUDIT §4).

### FB-06 · Medium · Admin could take over another admin
- **Repro (reviewer):** second admin PATCH `/api/admin/users/<owner>` → owner's email replaced and confirmed, role →
  customer, no trace.
- **Fix:** `assertMayManageAccount()` in `lib/admin/users.ts`: changing another **admin's** sign-in email, role
  (demotion), reset link or password requires the actor's confirmed Supabase Auth email to be in `ADMIN_EMAILS`.
  Name/phone edits and all customer/staff management unchanged. `adminConfirmEmail` now replaces the sign-up password
  with a random one and ends sessions (FB-02); the admin toast explains it.
- **Test:** `admin-edit-user` +4 cases (non-owner 403 ×4 and target unchanged; owner can demote; unconfirmed listed
  address can't; customers/staff manageable by any admin).

### FB-07 · Medium · No admin audit log
- **Fix:** `route()` wrapper → `recordAdminAction()` for every POST/PUT/PATCH/DELETE under `/api/admin/` with a
  signed-in user: actor id, role, method, path (contains the record id), HTTP status. No bodies → no passwords,
  codes, tokens, payment data. Best effort (logging failure never changes the response); anonymous 401s not stored.
- **Test:** `production-readiness › admin audit log` (row written with actor/status; staff price change 403 recorded;
  anonymous not recorded; no body/secret columns; customers can't read the table).

### FB-08 · Medium · No stock movement history
- **Fix:** `stock_movements` + `log_stock_movement()` triggers on `products.stock_grams` (unit g) and
  `product_variants.stock` (unit pack; derived weight-pack updates skipped, so nothing is double counted). Reason /
  order / actor come from transaction-local `set_config` via `labelStockChange()` at every call site (order placed,
  cancelled, hold expired, late payment, payment start failed, order adjustment, admin edit). Unlabelled changes are
  still recorded.
- **Test:** SQL check (take/return/admin edit/no-op/derived/malformed id) + `production-readiness › stock movement
  history` (−4000 g `order_placed`, +4000 g `order_cancelled`, `admin_edit` from the inventory API).

### FB-10 · Medium (partial) · Expired holds only released daily
- **Fix:** `.github/workflows/release-expired-holds.yml` (every 10 min + manual run) calling
  `/api/cron/release-expired` with `Authorization: Bearer $CRON_SECRET`; skips with a notice until the secret and
  `SITE_URL` variable exist. `vercel.json` left daily (Hobby fails deploys with sub-daily crons).

### FB-13 / FB-31 / FB-32 · Mobile
- `config.ts`: non-dev builds default to `https://fresh-basket-veg.vercel.app` (verified in an Android export: no
  localhost left). `cart.tsx`: in-flight quote ignored after emptying the cart. `orders/[id].tsx`: polling stops after
  5 consecutive failures, on 401/403/404, or 2 min after the hold ends (one final load shows the cancellation).

### FB-18 · Low · Guest cap race — `pg_advisory_xact_lock(hashtext('place_order:guest_shop_cap'))` after the
per-number lock. Mutation-tested: without it the burst test ends at 46 open orders; with it ≤ 40.

### FB-19 · Low · GET pay page could cancel — `preparePayment(order, { cancelOnFailure: false })` from the page;
the claim is released and a 503 shown; refresh retries. POST routes unchanged.

### FB-20 / FB-21 · Low · Column grants + FK indexes — migration `20261104000002` (dynamic column list from the
catalog, so it matches the live schema). Test: customer can read own order, not `actor`/`idempotency_key`/
`created_by`; customer order screen still loads.

### FB-22 · Low · Webhook checkout path — ignores `payment.captured`/`order.paid` events whose payment isn't
`captured` INR (when the payload says so).

### FB-23 · Low · `cookieOptions.secure` on HTTPS in the proxy, server client and browser client.

### FB-24 · Low (partial) · Recovery mode only for `type=recovery` links or a PKCE code link (no type) to
`/reset-password`. Test: magic/sign-up/email links with `next=/reset-password` set no recovery cookie; PKCE still does.

### FB-25 · Low (partial) · `DATABASE_CA_CERT` (PEM, `\n` escapes allowed) → `{ rejectUnauthorized: true, ca }`
in the app pool and the migration script; unset = previous behaviour.

### FB-27 · Low · Inventory partial save — on a failure after some parts saved, those rows' edits are dropped and
the table reloaded with an explanation, so a retry can't re-apply "+N since loaded".

### FB-28 / FB-29 / FB-30 · Low · robots `Host:` removed; `GroceryStore` + `WebSite` JSON-LD
(`lib/structured-data.ts`, 3 unit tests incl. `</script>` escaping); `all-migrations.sql` regenerated.

## Round 2 — branch `fix/remaining-audit-items` (5 Nov 2026)

Started from `audit/production-readiness`, reconciled with `main` (merge commit `459d8b2`: the audit branch and
PR #36 had both created `stock_movements` / `admin_audit_log`; `20261104000001` now only adds `fb_setting_uuid`, and
`20261105000002` merges the two stock-ledger designs — without this, the second migration would have failed on
production and blocked the deploy). One commit per item; each bug reproduced by a failing test first.

| ID | Commit | Fix | Test (written first → failed before, passes after) |
| --- | --- | --- | --- |
| FB-33 | `86ea243` | `mark_order_paid`: blockers `raise … using errcode = 'P0F01'`; `exception when sqlstate 'P0F01'` only. Other errors roll back → webhook 500 → Razorpay retries. Migration `20261105000003` (function copied from `20261027000002`, only this change) | `test/remaining-audit` FB-33 ×4 (40P01 / 55P03 / 40001 → error, order stays cancelled+failed; real blocker → refund_required) |
| FB-34 | `7b98a7e` | verify route: one transaction — `select … for update` → usable? → capture → `mark_order_paid` (`applyVerifiedPayment(client)`); notifications after commit. A cancel waits, then cancels a paid order normally; an order cancelled before verify is never captured | `test/razorpay-http` FB-34 ×2 (cancel during capture waits; verify → paid; no "payment received for a cancelled order"; cancelled first → not captured) |
| FB-38 | `dbea9e1` | `admin_request_log.payload_hash` (migration `20261105000004`); key-order-independent SHA-256 of the save (requestId excluded). Same hash → skip; different → 409 `REQUEST_ID_REUSED`; old rows (null) → skip | `test/remaining-audit` FB-38 ×2 (inventory + product form) |
| FB-26 | `1b23176` | `lib/known-slugs.ts` in `proxy.ts`: GET/HEAD `/product/<slug>`, `/category/<slug>` checked against active slugs from the cached `/api/catalog/slugs` (tag `catalog`, 60 s); per-instance 60 s TTL, miss re-check ≤ every 10 s, fail open; unknown → rewrite to an unmatched path → `app/not-found.tsx` (shop 404, same header/footer) with 404. Loading skeletons kept | `next build` + `next start`: before 200/200 → after `/product/no-such-veg-xyz` 404, `/category/no-such-cat` 404, real slugs 200; `test/known-slugs` ×4 |
| S-21 / FB-24 | `5c8b3cf` | `/auth/callback` GET with `token_hash` → same-origin confirm page (no script, no-store, noindex, Referrer-Policy same-origin) whose form POSTs; `verifyOtp` only on POST with Origin = this site (or `Sec-Fetch-Site: same-origin`); 303 after. PKCE `?code=` + error links unchanged. The page can't show the masked email (unknown until the token is verified; a URL value would be attacker-controlled) | `test/auth-callback` 12/12 (+3 new); e2e `login_recovery` 31/31 (clicks Continue), `email_otp` 20/20, `signup_code` 7/7 |
| FB-05 | `7734e1f` | optional Turnstile: `lib/turnstile.ts` (server, siteverify, fail open on Cloudflare outage), `lib/client/turnstile.ts` (on-demand widget), 4 calls to `/api/auth/email`, CSP + site key only when both keys set; names in `.env.example` / `ENVIRONMENT_SETUP.md` | `test/turnstile.integration` ×6 |
| FB-14 | `5470ef9` | app: `lib/large-secure-store.ts` (AES-256-CTR, fresh key + IV per write, key in SecureStore, wrong-key marker, plain-session migration) wired via `lib/session-storage.ts`; `removeSupabaseSessions` deletes keys too | `apps/mobile/test/large-secure-store` ×4 (Node, in-memory stores, real AES) |
| FB-36 | `5c59918` | app: `randomId()` = `expo-crypto` `randomUUID()` | `apps/mobile/test/id` (failed: Math.random → identical ids) |
| FB-37 | `43f1acf` | app: (a) `auth-callback.tsx` → `completeOAuthRedirect(code)`, one exchanger shared with Google sign-in; (b) `app/+native-intent.tsx` + `lib/order-links.ts` drop a repeated `orders/<id>` link (10 s, or that order already on screen) and refresh the screen | `apps/mobile/test/deep-links` ×4 |
| FB-15 | `de45658` | Expo SDK 58: `expo` ~58.0.23, all `expo-*` via `EXPO_OFFLINE=1 npx expo install --fix`, RN 0.88.1, React 19.3; lock regenerated (no `--force` / `--legacy-peer-deps`); one type fix (`TextField` ref → `ComponentRef<typeof TextInput>`) | tsc, Android export, `smoke.py`, `auth_mock.py`, `whatsapp_order.py` (see TEST_RESULTS §7) |

Migrations added in this round (all additive / idempotent, rollback SQL at the end of each file):
`20261105000003_mark_order_paid_transient_errors.sql` (create or replace function) ·
`20261105000004_admin_request_log_payload_hash.sql` (add column if not exists). `supabase/all-migrations.sql`
regenerated with `scripts/build-all-migrations.sh`.

## Not fixed (and why)

FB-01, FB-09, FB-11, FB-12, FB-16, FB-35 need dashboard/owner actions (see `PRODUCTION_READINESS.md`). FB-02 needs a
live sign-up test. *(Round 2, 5 Nov: FB-14, FB-15, FB-24/S-21, FB-26, FB-33, FB-34, FB-36, FB-37, FB-38 fixed and FB-05
extended — section above.)* Still needs a real phone: FB-14 (sign-in survives restart/update), FB-37 (Google
sign-in, payment return on Android), SDK 58 build on device (EAS). FB-05 Turnstile needs the owner's Cloudflare keys.
