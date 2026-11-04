# Domain, DNS, SSL, Vercel & Server Audit — 4 Nov 2026

All facts below were read through the Vercel API (team `lakhans8833s-projects`) on 4 Nov 2026 ~20:40 UTC, read-only.
Nothing was changed in Vercel or DNS. The sandbox's network policy blocks direct HTTPS to the live hosts
(`fresh-basket-veg.vercel.app`, `fresh-basket-brown.vercel.app`, `ramsfreshbasket.com` → proxy 403), so live pages
were fetched with Vercel's authenticated fetch tool, and **public reachability from the internet was not re-tested in
this round** (UNVERIFIED; the 28 Oct audit read the site publicly).

## 1. Projects and domains

| Vercel project | Domains | Latest production deployment | Database (from live CSP) |
| --- | --- | --- | --- |
| `fresh-basket-veg` | `ramsfreshbasket.com` (verified, apex), `www.ramsfreshbasket.com` (verified, **308 → apex**), `fresh-basket-veg.vercel.app` | `dpl_EQmvUhuuGjXAmXJeQYmJSTRCjjpj` READY, commit `d7e13fc` (PR #35) | Supabase `dhtkqanvrnuyykslxdfs` |
| `fresh-basket` | `fresh-basket-brown.vercel.app` | `dpl_BLgDyhi6REBCww5FyfYNbcitVDTq` READY, same commit | same Supabase project |

Both projects: Vercel Authentication `all_except_custom_domains` (Standard Protection) → per-deployment URLs
(`fresh-basket-*-lakhans8833s-projects.vercel.app`) require a Vercel login, so they are not indexable duplicates. ✅
Node 24.x, framework Next.js.

## 2. DNS — FB-01 (High, EXTERNAL)

`ramsfreshbasket.com` / `www`: nameservers `nova.dns-parking.com`, `cosmos.dns-parking.com` (Hostinger parking);
A record `2.57.91.91`; Vercel: **`misconfigured: true`** for both. The domain is attached and verified in Vercel, but
traffic never reaches Vercel, so no certificate can be issued for it and visitors see the registrar's parking page.

**Exact fix (DNS panel of the registrar, hPanel → Domains → DNS / Nameservers):**

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` (Vercel recommended; `76.76.21.21` also accepted) | 3600 |
| CNAME | `www` | `cname.vercel-dns.com.` (or project-specific `009100887ca6155d.vercel-dns-017.com.`) | 3600 |

Delete any other A/AAAA records on `@` (the parking `2.57.91.91`). Vercel then issues the Let's Encrypt certificate
automatically (minutes). Check: Vercel → Project `fresh-basket-veg` → Settings → Domains shows "Valid Configuration".

## 3. SSL / HTTPS / headers (production response, `fresh-basket-veg.vercel.app/robots.txt`)

| Check | Result |
| --- | --- |
| HTTPS + HSTS | `strict-transport-security: max-age=63072000; includeSubDomains; preload` ✅ (Vercel-managed certificate on `*.vercel.app`) |
| HTTP → HTTPS | Vercel redirects all `http://` to `https://` by platform default (not re-tested from here: plain HTTP egress blocked) |
| CSP | present, scripts limited to self + Razorpay, `object-src 'none'`, `frame-ancestors 'self'`, connect limited to Supabase/Razorpay/bigdatacloud ✅ |
| `x-frame-options` | `SAMEORIGIN` ✅ · `x-content-type-options: nosniff` ✅ · `referrer-policy: strict-origin-when-cross-origin` ✅ · `permissions-policy` (camera/mic off, geolocation self, payment Razorpay) ✅ |
| `x-powered-by` | absent ✅ (`poweredByHeader: false`) |
| SSL for `ramsfreshbasket.com` | **not issued / not serving** until DNS is fixed (FB-01) |

## 4. Canonical domain & duplicate indexing — FB-09 (Medium, EXTERNAL)

- `fresh-basket-veg` Production `NEXT_PUBLIC_APP_URL = https://fresh-basket-veg.vercel.app` → robots/sitemap/canonical
  point there ✅.
- `fresh-basket` (brown) has no `NEXT_PUBLIC_APP_URL` → falls back to its own production URL → its robots.txt says
  `Sitemap: https://fresh-basket-brown.vercel.app/sitemap.xml` (read live) → **same catalogue indexed twice** ❌.
- When `ramsfreshbasket.com` works it will serve the same project; the canonical stays `fresh-basket-veg.vercel.app`
  until `NEXT_PUBLIC_APP_URL` is changed.

**Decision for the owner:** which domain is primary? Recommended: **`https://ramsfreshbasket.com`** (brand domain),
once DNS is fixed:
1. `fresh-basket-veg` → Settings → Environment Variables → Production `NEXT_PUBLIC_APP_URL=https://ramsfreshbasket.com` → Redeploy.
2. Settings → Domains → `fresh-basket-veg.vercel.app` → Edit → Redirect to `ramsfreshbasket.com` (308).
3. Mobile app `eas.json` `EXPO_PUBLIC_API_URL` and `apps/mobile/src/lib/config.ts` `PRODUCTION_API_URL` → new domain (new app build).
4. Supabase → Authentication → URL configuration: Site URL + redirect `https://ramsfreshbasket.com/auth/callback` (keep the old one during transition).
5. Razorpay webhook URL → new domain.
6. Brown project: delete it, or set its `NEXT_PUBLIC_APP_URL` to the primary and redirect its domain.
7. Google Search Console: add the new property, submit `/sitemap.xml`.

If the owner keeps `fresh-basket-veg.vercel.app` as primary, only step 6 is needed now. *Not changed by me:
production settings require the owner's approval.*

## 5. robots.txt / sitemap / Open Graph / structured data

- robots: blocks admin, API, account, checkout, cart, pay, auth ✅; non-standard `Host:` line removed (FB-28).
- sitemap: static pages + active categories + products with an active pack, from `NEXT_PUBLIC_SITE_URL ||
  NEXT_PUBLIC_APP_URL` ✅ (`force-dynamic`).
- Open Graph/Twitter: `metadataBase` = site URL, `/og-image.jpg` 1200×630 ✅.
- Structured data: Product (real prices/stock, ratings only from published reviews) ✅; **new** GroceryStore +
  WebSite/SearchAction on the home page from Admin settings + delivery areas only (FB-29).
- 404: unknown paths → 404 ✅; unknown product/category slugs → 200 + `noindex` (FB-26, OPEN).

## 6. Vercel server configuration

| Item | Finding |
| --- | --- |
| `vercel.json` | `regions: ["iad1"]`, cron `/api/cron/release-expired` `30 20 * * *` (02:00 IST daily) |
| Plan | **Hobby** (confirmed: runtime logs retained 1 h; Hobby crons max once a day). Hobby is for non-commercial use under Vercel's terms → **upgrade to Pro before trading** (FB-11) |
| Function region | `iad1` (US-East). x-vercel-id shows `iad1:iad1`. Indian users → edge in India, function in the US, then the database. **DB region UNVERIFIED** (live Supabase project not accessible; the only visible project `kxbguyrskryfnfyaxkxn` "fresh-basket-veg" is in `ap-northeast-2`/Seoul and INACTIVE — not the one production uses). FB-12 |
| Cold starts | 28 Oct measurement: TTFB 0.3 s warm / 2.2 s cold (previous audit). `pg` pool max 3 per instance, `attachDatabasePool` (Fluid) ✅ |
| Timeouts | no custom `maxDuration`; Razorpay calls time out at 15 s; payment preparation waits ≤ 25 s — fits the Hobby/Pro defaults |
| Env vars | see `ENVIRONMENT_SETUP.md` (names only) |
| Production errors (7 days) | 8 error groups, all `EMAXCONN` (3 Nov 18:10 UTC) + pg overlap warnings (≤ 2 Nov) → fixed by PR #30, **no occurrences since** (FB-17) |
| Migrations | run automatically by `scripts/migrate.mjs` **before every production build** (skipped on Preview). ⚠️ Merging this branch applies migrations `20261104000001/2` to production — see `DEPLOYMENT_GUIDE.md` |

### Region decision (owner, 2 minutes)
Supabase dashboard → project `dhtkqanvrnuyykslxdfs` → Project Settings → General → **Region**:
- `ap-south-1` (Mumbai) → change `apps/web/vercel.json` to `"regions": ["bom1"]`.
- `ap-southeast-1` (Singapore) → `"sin1"`.
- `us-east-1` → keep `iad1` (but consider moving the DB to Mumbai for Indian customers; a migration, not a setting).

## 7. Cron (expired stock reservations)

| Check | Result |
| --- | --- |
| `CRON_SECRET` configured | ✅ Production + Preview (name present, sensitive) |
| Endpoint authentication | ✅ `Authorization: Bearer` constant-time compare; 401 without; fails closed when unset (local 401 verified) |
| Duplicate stock release | ✅ prevented: rows locked `for update skip locked`, `stock_released` flag, `cancel_order` idempotent |
| Schedule | daily only (Hobby) → **new GitHub Actions workflow every 10 min** (FB-10); also lazy release on shopper traffic (≤ once/min/instance) and admin views |

**Manual verification checklist (after setting the GitHub secret/variable):**
1. GitHub → Settings → Secrets and variables → Actions: secret `CRON_SECRET` (same value as Vercel), variable `SITE_URL`.
2. Actions → "Release expired stock holds" → Run workflow → log shows `HTTP 200` and `{"released":N,...}`.
3. Vercel → Project → Cron Jobs: the daily job shows 200 (not 401).
4. Optional: `curl -i https://<site>/api/cron/release-expired` without the header → `401`.
