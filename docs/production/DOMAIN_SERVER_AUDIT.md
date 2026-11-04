# Domain, DNS, SSL & Vercel Server Audit (5 Nov 2026)

Checked through the Vercel API (project/domain/deployment data, env **names** only), read-only requests from the
owner's browser, and the repository. Nothing in Vercel or DNS was changed by this audit, except adding
`ramsfreshbasket.com` + `www` to project `fresh-basket-veg` on 4 Nov (owner approved).

## Domains
| Host | Project | State | Evidence |
|---|---|---|---|
| `fresh-basket-veg.vercel.app` | fresh-basket-veg | **Primary**, HTTPS works, `NEXT_PUBLIC_APP_URL` points here | live pages load over https; env name present |
| `ramsfreshbasket.com` | fresh-basket-veg | Added to Vercel, **DNS not pointed yet** (`misconfigured: true`) | Vercel domain config: nameservers `nova/cosmos.dns-parking.com` (Hostinger), A = `2.57.91.91` (Hostinger parking) |
| `www.ramsfreshbasket.com` | fresh-basket-veg | Added, 308 → apex once DNS works | Vercel project domains |
| `fresh-basket-brown.vercel.app` | fresh-basket | **Duplicate copy of the site** (own canonical + sitemap) — R8-06 | live canonical/sitemap = brown host |

### DNS records the owner must add at Hostinger (Domains → DNS)
| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| A | `@` | `64.29.17.1` |
| CNAME | `www` | `009100887ca6155d.vercel-dns-017.com` |
Remove the parking A/AAAA record for `@` and any CNAME for `www` first. Vercel issues the SSL certificate by itself
once the records resolve.

### SSL / HTTPS
| Check | Status |
|---|---|
| `*.vercel.app` certificate | Verified indirectly: the browser loads every page over https without warnings |
| `ramsfreshbasket.com` certificate | **Not yet issued** (DNS not pointed) — re-check after DNS |
| HTTP → HTTPS | **Unverified from here** (plain-HTTP requests cannot be made from this environment). Vercel redirects HTTP to HTTPS for all domains by default; HSTS header is sent |
| HSTS | Verified (header present) |

## Canonical URL, sitemap, robots, Open Graph, structured data
| Item | veg | brown |
|---|---|---|
| `<link rel=canonical>` | its own host | its own host (duplicate) |
| `sitemap.xml` host | `NEXT_PUBLIC_APP_URL` | brown (no `NEXT_PUBLIC_APP_URL` on that project) |
| `robots.txt` | allows shop pages, blocks `/admin`, `/api/`, `/account`, `/checkout`, `/order`, `/orders/`, … | same |
**Fix:** code (R8-06, branch `audit/round-8`) redirects production page requests on any other host to
`NEXT_PUBLIC_APP_URL` (308, path kept; APIs, `/auth/*`, previews untouched). **External step:** project
`fresh-basket` → Environment Variables → `NEXT_PUBLIC_APP_URL = https://fresh-basket-veg.vercel.app` → Redeploy.
After that, the brown address forwards to the main site and stops being indexed.

When `ramsfreshbasket.com` is live: set `NEXT_PUBLIC_APP_URL = https://ramsfreshbasket.com` on **both** projects
and redeploy — only **after** the domain opens with a valid certificate, otherwise every page would redirect to an
address that does not work yet.

## 404 / 500
- Unknown paths: 404 (live). Unknown product/category: not-found page with status 200 + `noindex` (OPEN-09, low).
- Server errors: Vercel runtime errors last 24 h — **0** on both projects (5 Nov).

## Security headers (live)
HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy present;
`x-powered-by` absent. `.env`, `.git/config` → 404.

## Vercel configuration (`vercel.json`)
| Setting | Value | Assessment |
|---|---|---|
| `regions` | `["iad1"]` (Washington DC) | Matches the database: `/api/health` → `databaseRegion: us-east-1`, query 3 ms. Moving functions to `bom1` (Mumbai) **without** moving the database would add ~200 ms to every query — **do not** change alone |
| Cron | `/api/cron/release-expired` daily 20:30 UTC (02:00 IST) | Hobby plan allows daily crons only. Not relied on: expired holds are also released on every order placement, the customer's order list and Admin order screens (`releaseExpired`), so a short-lived reservation never waits for the cron. With COD only there are no payment holds today |
| `CRON_SECRET` | set (`/api/health`) | Endpoint returns 401 without it (`api/cron/release-expired`) |
| Build | `migrate.mjs` → images → `next build` | Migrations only on production builds (preview builds skip) |
| Preview env | Same database as production (see SECURITY_AUDIT) | Keep Vercel deployment protection on |

### Indian customers: latency
Today: function `iad1` + database `us-east-1` → fast queries (3 ms) but ~200–250 ms network from India to the
server. To serve India faster the **database and the functions must move together** (Supabase project in
`ap-south-1` Mumbai + Vercel region `bom1`). That is a database migration with downtime planning — owner decision;
not done.

## Status
Domain: primary `.vercel.app` OK; custom domain waiting for DNS. SSL: OK on vercel.app; custom pending. Server
configuration: OK; one external step for the duplicate host.
