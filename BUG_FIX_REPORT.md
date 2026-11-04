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

## Not fixed (and why)

FB-01, FB-09, FB-11, FB-12, FB-16, FB-35 need dashboard/owner actions (see `PRODUCTION_READINESS.md`). FB-02 needs a
live sign-up test. FB-14, FB-15, FB-36, FB-37 need device testing / an Expo SDK upgrade. FB-26 trade-off documented.
FB-33, FB-34 are unreproduced edge cases in the most sensitive payment function — change with dedicated tests.
FB-38 low; main trigger closed.
