# Deployment Guide

## How a change goes live
1. Work on a branch; run the checks below locally.
2. Open a pull request to `main` on GitHub (`lakhans8833/Fresh-basket`).
3. Vercel builds a **preview** for the PR (no database migrations on previews).
4. Merge (squash) → Vercel builds **production** for both projects (`fresh-basket-veg`, `fresh-basket`).
   The production build runs `apps/web/scripts/migrate.mjs` first: new files in `supabase/migrations/` are applied
   once, in filename order, tracked in `_fb_migrations`. Then `next build`.
5. Watch the commit status "Vercel – fresh-basket-veg" until it is **success**; then check `/api/health` and
   Vercel → Logs / Runtime errors.

## Checks before merging
```
npm install
npm run typecheck                 # shared + web
npm run lint -w apps/web
npm run test                      # vitest: shared + web (needs a local Postgres; see scripts/local-db.sh)
npm run build                     # migrate (local DB) + next build
cd apps/mobile && npx tsc --noEmit && npx expo export --platform ios --platform android
```
Full end-to-end runs used in the audits (Playwright scripts in `apps/web/e2e/`): sign-in with a fake Supabase Auth
(`email_otp.py`, `signup_code.py`, `login_recovery.py`, `session_refresh.py`), order flows (`qa_plan.py`,
`flow`, `checkout_retry`, `whatsapp.py`, `after_delivery.py`), responsive + accessibility sweeps.

## Database changes
- Migrations must be **add-only and re-runnable** (`if not exists`, `drop … if exists` before `create`).
- Write the undo in the migration header (example: `20261105000001_admin_audit_log_and_stock_ledger.sql`).
- Before a risky migration: check Supabase → Database → Backups for what your plan includes, and take your own
  `pg_dump` (Supabase → Project Settings → Database → connection string) — on the free plan this is the only backup
  you control.
- Never edit an already-applied migration file; add a new one.
- Emergency switch: `SKIP_DB_MIGRATIONS=true` on the project skips migrations for a build.

## Rollback
- Code: Vercel → Deployments → previous production deployment → "Promote to Production" (instant), or revert the
  PR on GitHub.
- Database: migrations are add-only, so old code keeps working with the new tables. If a migration itself must be
  undone, run the undo statements from its header in the Supabase SQL editor.

## Custom domain go-live (ramsfreshbasket.com)
1. Hostinger DNS records (see `DOMAIN_SERVER_AUDIT.md`).
2. Wait until `https://ramsfreshbasket.com` shows the site with a padlock (Vercel → Domains shows "Valid").
3. `NEXT_PUBLIC_APP_URL = https://ramsfreshbasket.com` on both projects → Redeploy both.
4. Supabase → Authentication → URL Configuration → Site URL + Redirect URL `https://ramsfreshbasket.com/auth/callback`.
5. `apps/mobile/eas.json` → `EXPO_PUBLIC_API_URL` → new domain (code change, next app build).
6. Google Search Console: add the domain, submit `https://ramsfreshbasket.com/sitemap.xml`.

## Cron
`vercel.json`: `/api/cron/release-expired` daily 02:00 IST (Hobby allows daily only). Needs `CRON_SECRET`. Stock
holds are also released on normal traffic, so the cron is a safety net.
