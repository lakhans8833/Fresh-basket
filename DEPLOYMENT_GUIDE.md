# Deployment Guide

## How production deploys work today

1. A merge to `main` triggers Vercel builds for **both** projects (`fresh-basket-veg`, `fresh-basket`).
2. The build runs `node scripts/migrate.mjs` **first**: on Production builds it applies every new file in
   `supabase/migrations/` (in a transaction, advisory-locked, recorded in `public._fb_migrations`) and promotes
   confirmed `ADMIN_EMAILS` accounts. Preview builds skip migrations.
3. Then `site-images.mjs` and `next build`.

⚠️ **Merging = applying migrations to the live database.** This branch adds two:

| Migration | What it does | Risk | Reversible |
| --- | --- | --- | --- |
| `20261104000001_stock_movements_admin_audit.sql` | new tables `stock_movements`, `admin_audit_log`; two AFTER triggers on `products.stock_grams` / `product_variants.stock` | additive; a trigger error would fail a stock change → tested on take/return/admin edit/derived packs/malformed labels | yes — rollback SQL at the end of the file |
| `20261104000002_utr_hold_fk_indexes_column_grants.sql` | replaces `release_expired_reservations()` (adds the UTR exclusion only); 3 indexes; column-level SELECT grants for `authenticated` on `orders`, `order_events`, `order_adjustments` | indexes on small tables (quick); grants only affect direct Supabase API reads by customers — the app's own customer queries were re-run against the new grants | yes — rollback SQL at the end of the file |

No data is updated or deleted by either migration.

## Release checklist for this branch

1. **Backup first.** Supabase → Database → Backups (Pro) — or locally:
   `pg_dump "$POSTGRES_URL_NON_POOLING" -Fc -f freshbasket-$(date +%F).dump` (needs the connection string from the
   Supabase dashboard; keep the file private).
2. **Review** the PR (two migrations above, `lib/orders.ts`, `lib/admin/users.ts`, `lib/http.ts`).
3. Optional dry run: create a Supabase **branch** or a copy of the database, set `MIGRATIONS_DATABASE_URL` to it and
   run `node apps/web/scripts/migrate.mjs` locally; or run `npm test` (it builds a throwaway DB from all migrations).
4. Merge → watch both Vercel builds: the log shows `[migrate] applying 20261104000001…`, `…000002…`, `done (2 new migrations)`.
5. **Smoke test production** (no real payment): home, shop, a product, add to cart, checkout page shows the total,
   `/robots.txt` (no `Host:`), home page source contains `"@type":"GroceryStore"`, Admin dashboard shows the
   "UPI payments to check" tile, Admin → Inventory save works.
6. Check `select count(*) from admin_audit_log;` grows after an admin save, and
   `select * from stock_movements order by id desc limit 5;` shows `order_placed` after the next order.
7. GitHub Actions: add `CRON_SECRET` secret + `SITE_URL` variable, run "Release expired stock holds" once → HTTP 200.

## Rollback

- **Code:** Vercel → Deployments → previous production deployment → "Instant Rollback" (the migrations stay applied;
  both are backward compatible with the old code: old code doesn't send `expectedTotal`, ignores the new tables, and
  its customer queries use only columns that stay granted).
- **Database (only if needed):** run the rollback block at the end of each migration file, in reverse order.

## Mobile app

`cd apps/mobile && npm ci && npx tsc --noEmit`, then `npx eas-cli build --platform android --profile preview`
(internal APK) → test on a real phone (login by email code, browse, cart, checkout COD, order screen, addresses,
deep link return from the pay page) → `--profile production` for the Play Store. The production profile already uses
`https://fresh-basket-veg.vercel.app`. Before publishing: Expo SDK 58 upgrade (FB-15) and encrypted session storage
(FB-14) are recommended.

## Environment changes

See `ENVIRONMENT_SETUP.md`. `NEXT_PUBLIC_*` values are compiled in at build time → **redeploy** after changing them.
