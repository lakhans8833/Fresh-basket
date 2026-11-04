# Environment Setup

Names only — **no values are printed in this repository**. "Prod" / "Preview" = what is set in the Vercel project
`fresh-basket-veg` today (read 4 Nov 2026 via the Vercel API, values not decrypted). Never commit `.env*` files
(`.gitignore` covers them). Never put a secret in a `NEXT_PUBLIC_*` variable (those are compiled into the browser bundle).

## 1. Web app (`apps/web`, Vercel project `fresh-basket-veg`)

| Variable | Secret? | Required | Prod | Preview | Purpose / notes |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | no (public) | yes | ✅ (integration) | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public) | yes | ✅ | ✅ | anon key, RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | yes | ✅ | ✅ | server only: storage uploads, admin auth actions, store-sent email codes |
| `POSTGRES_URL` (or `DATABASE_URL`) | **yes** | yes | ✅ (integration) | ✅ | **transaction pooler** URL (port 6543); `DATABASE_URL` wins if both set |
| `POSTGRES_URL_NON_POOLING` / `MIGRATIONS_DATABASE_URL` | **yes** | for migrations | ✅ | ✅ | used by `scripts/migrate.mjs` (session pooler URL) |
| `DATABASE_CA_CERT` | no | optional (**new**) | ❌ | ❌ | Supabase CA PEM → verified DB TLS (FB-25). Set on Preview first |
| `APP_SECRET` | **yes** | yes | ✅ | ✅ | signs pay/track/recovery tokens (≥ 32 random chars) |
| `NEXT_PUBLIC_APP_URL` | no | yes | ✅ `https://fresh-basket-veg.vercel.app` | ❌ (falls back to the deployment URL — fine) | canonical/sitemap/payment links |
| `NEXT_PUBLIC_SITE_URL` | no | optional | ❌ | ❌ | overrides `NEXT_PUBLIC_APP_URL` for SEO URLs only; not needed |
| `CRON_SECRET` | **yes** | yes | ✅ | ✅ | `/api/cron/release-expired` bearer secret. Also add as a **GitHub Actions secret** (FB-10) |
| `ADMIN_EMAILS` | no | recommended | ✅ | ✅ | comma-separated **owner** emails: promoted to admin on deploy once confirmed, and (**new**) the only admins allowed to manage other admins (FB-06) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | `SMTP_PASS` **yes** | for store-sent email codes | ✅ (set 4 Nov) | ❌ | Note: the variable is **`SMTP_PASS`** (not `SMTP_PASSWORD`). `SMTP_SECURE` optional (465 → TLS) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | secret key **yes** | optional | ❌ | ❌ | Cloudflare Turnstile on the email-code form (FB-05). Active only when **both** are set; without them nothing changes. Redeploy after changing (the site key is built into the page). The phone app is not asked for a token (rate limits only) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | secret + webhook secret **yes** | for online payment | ❌ | ❌ | all three needed; otherwise online checkout is hidden (FB-16). Use **test keys on Preview**, live keys on Production only |
| `PAYMENT_RESERVATION_MINUTES` | no | optional | ❌ (default 15) | | stock hold for online payment |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | no | optional | ❌ | | fallback; Admin → Settings → WhatsApp takes precedence |
| `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_*` | token **yes** | optional | ❌ | | automatic WhatsApp order updates |
| `NEXT_PUBLIC_SERVICE_AREA`, `NEXT_PUBLIC_DEFAULT_CITY`, `NEXT_PUBLIC_DEFAULT_STATE` | no | optional | ❌ (defaults: "Faridabad & nearby areas", Faridabad, Haryana) | | copy + structured data |
| `SUPABASE_STORAGE_BUCKET` | no | optional | ❌ (default `product-images`) | | |
| `DB_POOL_MAX` | no | optional | ❌ (default 3) | | keep small on serverless |
| `EXTRA_ALLOWED_ORIGINS` | no | optional | ❌ | | dev only (Expo web) |
| `ALLOW_DEV_MODE`, `PAYMENTS_MOCK` | no | **never on Production** | ❌ ✅ | ❌ | dev login / test payments; production refuses them anyway on `VERCEL_ENV=production` |
| `SKIP_DB_MIGRATIONS`, `MIGRATE_PREVIEW`, `SEED_SAMPLE_DATA` | no | optional | ❌ | ❌ | migration control (`SEED_SAMPLE_DATA=false` for a new real project) |

Also present from the Vercel ↔ Supabase integration (not read by the app directly, harmless): `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_DATABASE`, `POSTGRES_PRISMA_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_JWT_SECRET` (used only to derive a fallback app secret), `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

**Second project `fresh-basket`** (brown domain): same integration; set `NEXT_PUBLIC_APP_URL` to the primary URL or
delete the project (FB-09).

### Preview vs Production
- Migrations never run on Preview builds (`VERCEL_ENV=preview` → skipped) ✅ — but the database variables come from
  the same Supabase integration store for Preview and Production, so Preview most likely **uses the production
  database** (values not read to confirm). Treat Preview deployments as live: orders placed there are real rows. They are
  behind Vercel Authentication (team members only). Never put live Razorpay keys on Preview.
- `SMTP_*` are Production-only → Preview sends emails through Supabase's mailer.

## 2. GitHub Actions (new, FB-10)

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CRON_SECRET` | same as Vercel Production `CRON_SECRET` |
| Variable | `SITE_URL` | primary production URL, e.g. `https://fresh-basket-veg.vercel.app` |

Repository → Settings → Secrets and variables → Actions.

## 3. Mobile app (`apps/mobile`)

| Variable | Where | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `eas.json` profiles `preview` + `production` | `https://fresh-basket-veg.vercel.app` ✅ (no localhost/LAN). Release builds without it now default to that URL (FB-13) |

## 4. Supabase dashboard (project `dhtkqanvrnuyykslxdfs`)

- Authentication → URL configuration: Site URL = primary domain; redirect URLs: `https://<primary>/auth/callback`,
  `freshbasket://auth-callback` (app).
- Authentication → Emails: SMTP configured (or rely on the store's SMTP path); templates with `{{ .Token }}` if
  Supabase's mailer is used.
- Database → Backups: confirm daily backups exist (Pro plan) **before** merging migrations.

## 5. Razorpay dashboard (when enabling online payment)

Webhook URL `https://<primary>/api/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`,
`payment_link.paid`, secret → `RAZORPAY_WEBHOOK_SECRET`. Keep **automatic capture ON** (FB-35). Test mode first.
