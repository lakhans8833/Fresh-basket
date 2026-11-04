# Environment Setup

Values are **never** written here or committed. Set them in Vercel → Project → Settings → Environment Variables
(Production; Preview where noted) and redeploy — a change takes effect only on a new deployment.
`.env.example` files in `apps/web` and `apps/mobile` list the same names for local use.

## Live state (names only, checked 5 Nov 2026 via the Vercel API)
**fresh-basket-veg (primary, 25 variables):** `NEXT_PUBLIC_APP_URL`, `APP_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, Supabase integration set (`SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`,
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `POSTGRES_HOST`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DATABASE`).

**fresh-basket (brown, duplicate):** Supabase integration set + `SMTP_PASS` only. **Missing:** `NEXT_PUBLIC_APP_URL`
(see below), `APP_SECRET` (derived from the service key instead), `CRON_SECRET`, `ADMIN_EMAILS`, the other 4 SMTP names.

## Variables used by the code
| Name | Required | Used for | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | **Yes** | Links in emails/WhatsApp, canonical host redirect | `https://fresh-basket-veg.vercel.app` today; `https://ramsfreshbasket.com` only after the domain works. Set the **same** value on both projects |
| `NEXT_PUBLIC_SITE_URL` | No | Overrides canonical/sitemap URL | Leave unset (falls back to `NEXT_PUBLIC_APP_URL`); if set, must equal it |
| `APP_SECRET` | Yes | Signs payment/track links | Long random; never change without reason (old links stop working) |
| `CRON_SECRET` | Yes | Protects `/api/cron/release-expired` | Long random |
| `ADMIN_EMAILS` | Yes | Accounts promoted to admin on deploy | Comma-separated |
| `DATABASE_URL` / `POSTGRES_URL` | Yes | Database | Supabase pooler URL (integration sets `POSTGRES_URL`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Sign-in | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only admin calls (email codes, photo storage) | Never `NEXT_PUBLIC_` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | For email codes | Store sends sign-in codes itself | Gmail: `smtp.gmail.com`, `465`, App password (16 letters, no spaces). Note: the name is `SMTP_PASS` (not `SMTP_PASSWORD`) |
| `SMTP_SECURE` | No | Force TLS mode | Default: on for port 465 |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Only for online payments | Razorpay | **Not set** (COD only). Use test keys first; set auto-capture (R8-11) |
| `PAYMENT_RESERVATION_MINUTES` | No | How long unpaid online orders hold stock | Default 15 |
| `WHATSAPP_CLOUD_*`, `WHATSAPP_TEMPLATE_*` | No | Automatic WhatsApp updates (Meta Cloud API) | Not set; manual WhatsApp works without them |
| `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_SERVICE_AREA`, `NEXT_PUBLIC_DEFAULT_CITY`, `NEXT_PUBLIC_DEFAULT_STATE` | No | Defaults; Admin → Settings wins | |
| `SUPABASE_STORAGE_BUCKET` | No | Photo bucket name | Default `product-images` |
| `DB_POOL_MAX` | No | Connections per server instance | Default 3 (Supabase free pooler: 200 clients total) |
| `SEED_SAMPLE_DATA`, `SKIP_DB_MIGRATIONS`, `MIGRATE_PREVIEW`, `MIGRATIONS_DATABASE_URL` | No | Migration script switches | Leave unset in production |
| `ALLOW_DEV_MODE`, `PAYMENTS_MOCK`, `EXTRA_ALLOWED_ORIGINS` | **Never in production** | Local testing only | Dev login / mock payments are refused on Vercel production anyway |

### Mobile app (`apps/mobile/eas.json`)
`EXPO_PUBLIC_API_URL = https://fresh-basket-veg.vercel.app` in both `preview` and `production` profiles (no
development endpoint in builds). Change to the custom domain after it is live.

## Preview vs Production
Preview deployments receive the Supabase variables too (same database). They never run migrations. Recommended:
keep Vercel deployment protection on for previews, or connect a Supabase branch database for Preview.

## Pending owner actions (exact steps)
1. Project **fresh-basket** → `NEXT_PUBLIC_APP_URL = https://fresh-basket-veg.vercel.app` (Production) → Redeploy.
   With the round-8 code deployed, the brown address then forwards to the main site.
2. After `ramsfreshbasket.com` shows the site with a padlock: set `NEXT_PUBLIC_APP_URL = https://ramsfreshbasket.com`
   on both projects → Redeploy both; Supabase → Authentication → URL Configuration: add the new Site URL and
   `https://ramsfreshbasket.com/auth/callback` to Redirect URLs.
