# Fresh Basket — vegetable shop (website, admin panel, mobile app)

**Ram Avatar Fresh Basket** — *Fresh Vegetables, Healthy Life* — online vegetable shop for Faridabad & nearby areas.
The store name, logo, contact details, WhatsApp number, social links, delivery areas, slots, fees, minimum order
and Cash-on-Delivery are all editable in **Admin → Settings / Delivery**.

```
apps/web         Next.js 16 + TypeScript + Tailwind v4 — storefront, admin panel (/admin) and the HTTP API (/api)
apps/mobile      Expo (SDK 57) React Native + TypeScript, expo-router — Android & iOS app using the same API
packages/shared  Types, zod validation, price/discount/delivery calculation, order-status rules (used by web + mobile)
supabase/        SQL migrations (schema, RLS policies, order/payment functions, storage bucket) + seed.sql
scripts/         local-db.sh (local Postgres mirror of the schema), screenshot.py (visual review)
docs/API.md      API reference
```

## How it works

- **Prices, coupons, delivery fees, minimum order and totals are calculated on the server only**
  (`packages/shared/src/pricing.ts`, called from `apps/web/src/lib/quote.ts`). Clients send only variant IDs and quantities.
- **Stock**: checkout locks the variant rows (`SELECT … FOR UPDATE`), decrements with a guarded update and a
  `CHECK (stock >= 0)` constraint — tested with 10 concurrent checkouts for 4 units (exactly 4 succeed).
  Online-payment orders hold stock for 15 minutes; unpaid orders are cancelled and restocked automatically.
- **Payments**: Razorpay order is created server-side. An order becomes *paid* only after the server
  (a) verifies the checkout signature **and** fetches the payment from Razorpay to confirm it is captured for the right
  order and amount, or (b) receives a webhook with a valid `X-Razorpay-Signature`. Every webhook event is stored once
  (`payment_events` unique key) so retries/duplicates are harmless; amount mismatches are never marked paid; a payment
  that arrives after the hold expired re-reserves stock or is flagged *refund pending*.
- **Security**: Supabase Auth (JWT verified server-side), roles `customer` / `staff` / `admin` checked in every admin
  route, row-level security on every table (customers can only read their own orders/addresses; orders, payments and
  coupons can't be written from a client at all), customers can't change their own role (trigger), CSRF origin check
  for cookie requests, secrets only in server env vars.
- **Stock by weight**: products whose packs are all weights keep one total in grams (`products.stock_grams`); every
  pack's stock is derived from it and orders take/return grams (`take_stock` / `return_stock` lock the product row).
- **Reviews**: only a customer with a *delivered* order containing the product can review it; reviews show only after
  an admin publishes them (Admin → Reviews), and star ratings/counts are computed from published reviews only.
- **Caching**: shop/category/settings data is served from the Next.js data cache and dropped after every successful
  stock- or catalogue-changing API call (`apps/web/src/lib/cache.ts`); checkout always re-reads prices and stock.
- **Order workflow**: placed → packed → out for delivery → delivered (or cancelled before dispatch). Staff can only make
  valid transitions; nobody can mark an online order paid by hand. COD cash collection and refunds are recorded by staff.

## WhatsApp ordering

Customers can order **without an account**: Cart → **Order on WhatsApp** → `/order` (name, mobile, address, area,
city, PIN code, notes) → **Proceed to WhatsApp**. The site opens `https://wa.me/<number>?text=<encoded order>`; the
order reaches the seller only when the customer presses **Send** in WhatsApp — nothing is submitted automatically.

- Seller number: `NEXT_PUBLIC_WHATSAPP_NUMBER` (international format, digits only, e.g. `919876543210` — example format)
  or, if that's empty, the WhatsApp number in **Admin → Settings** (a 10-digit Indian mobile gets `91` added).
  With no valid number, all WhatsApp buttons are hidden and only the normal checkout is shown.
- Prices, discount and delivery charge in the message come from the server quote (`/api/quote`, live database prices).
  If the PIN code isn't in **Admin → Delivery**, the message says "Delivery: to be confirmed" instead of guessing.
- The message is built in the customer's browser and they can edit it in WhatsApp before sending, so treat it as an
  order *request*: confirm items and the amount in the chat. It is not a secure payment record — for online payments
  use the normal checkout (server-side totals + Razorpay verification).
- Message building/validation: `packages/shared/src/whatsapp.ts` (unit-tested). Customer text is cleaned of WhatsApp
  formatting/control characters and URL-encoded.
- The account checkout (`/checkout`, sign-in, slots, COD/Razorpay, order tracking) still works alongside it.

## PWA (install on phone)

- `app/manifest.ts` → `/manifest.webmanifest` (name, short_name, `start_url`, `display: standalone`, theme/background
  colours, 192/512 icons + 512 maskable icon). Icons live in `public/icons/` (generated from the logo mark).
- `public/sw.js` (registered in production only): caches static files and shows `/offline.html` when there's no
  connection. Pages, prices, cart API, checkout and admin are **never** cached — ordering needs internet. This is an
  offline fallback, not full offline shopping.
- Install testing needs **HTTPS** (Vercel URLs are HTTPS; `localhost` also counts as secure). Android Chrome:
  menu → *Install app* (or the footer **Install app** button). iPhone Safari: Share → *Add to Home Screen*.
  Check in Chrome DevTools → Application → Manifest / Service workers. Bump `VERSION` in `sw.js` when you change it.

## SEO

Per-page titles/descriptions, Open Graph + Twitter cards (`public/og-image.jpg`), canonical URLs (from
`NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_APP_URL`), `/sitemap.xml` (categories + products from the database),
`/robots.txt` (blocks admin, account, cart and checkout pages), clean category URLs (`/category/leafy-greens`; old
`/shop?category=` links 308-redirect) and Product structured data built only from real catalogue prices/stock
(no ratings or reviews). Submit the sitemap in Google Search Console once you have your final domain.

## Run locally

Requirements: Node 20+ (tested on 22), PostgreSQL 15+ (or a Supabase project).

```bash
npm install                                    # web + shared
# Local database (creates "freshbasket", applies migrations + seed + 2 dev users)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/freshbasket npm run db:reset
cp apps/web/.env.example apps/web/.env.local   # then set DATABASE_URL
npm run dev                                    # http://localhost:3000   (admin: /admin)
```

With no Supabase/Razorpay keys the app runs in **development mode**, shown by a banner on every page:
- *Development login* — sign in with any email, or the buttons for `customer@freshbasket.local` / `admin@freshbasket.local`.
- *Test payment* — simulates the gateway webhook through the same server code as Razorpay. **No money moves.**
- Image uploads are saved to `apps/web/public/uploads`.
Development features are disabled automatically in production builds.

Mobile app (see `apps/mobile/README.md`):
```bash
cd apps/mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:3000 npx expo start   # Android emulator: http://10.0.2.2:3000
```

## Tests and checks

```bash
npm run typecheck                 # shared + web
npm test                          # 18 unit tests (pricing, coupons, slots, statuses, WhatsApp message/URL) + 21 integration tests on a real Postgres
                                  # (creates throwaway DB "freshbasket_test"; set TEST_DATABASE_URL to change)
npm run build                     # production build of the web app
cd apps/web && npx eslint src
python3 apps/web/e2e/whatsapp.py http://localhost:3000 <number>   # browser E2E of WhatsApp checkout (window.open intercepted)
python3 apps/web/e2e/flow.py http://localhost:3000   # browser E2E: search → product → basket+coupon → checkout (COD) → test payment → reorder (needs Playwright + Chromium)
cd apps/mobile && npx tsc --noEmit && npx expo export --platform android
```

## Deploy

1. **Supabase**: create a project → `supabase link --project-ref <ref>` → `supabase db push` (applies `supabase/migrations`).
   Load sample data only if you want it: `psql "$DATABASE_URL" -f supabase/seed.sql` (it's sample catalogue/prices/PIN codes).
   Auth → URL configuration: site URL = your domain, add `https://<domain>/auth/callback`. Enable email auth (and SMTP for production email).
   Make yourself admin after signing up once: `update public.profiles set role = 'admin' where email = 'you@example.com';`
2. **Vercel** (or any Node host): import the repo, root directory `apps/web`, install command `npm install` (run at repo root
   via Vercel's monorepo support). Set the env vars from `apps/web/.env.example` (`DATABASE_URL` = Supabase *transaction pooler*
   URL, `APP_SECRET`, Supabase keys, Razorpay keys, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`). `apps/web/vercel.json` runs the
   reservation clean-up once a day (02:00 IST; Vercel Hobby allows only daily crons). Expired payment holds are also
   released on every checkout and admin order view, so the cron is just a backstop — on Pro you can make it `*/10 * * * *`.
3. **Razorpay**: Dashboard → API keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`). Webhooks → URL
   `https://<domain>/api/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`, secret →
   `RAZORPAY_WEBHOOK_SECRET`. Test with test-mode keys first. The footer and checkout show online payment only when all three are set.
4. **Mobile**: set `EXPO_PUBLIC_API_URL=https://<domain>`, replace placeholder icon/splash and bundle IDs in `app.json`,
   build with EAS (`npx eas build -p android|ios`). Payments open the site's hosted pay page in an in-app browser and
   return via the `freshbasket://` deep link.

## Remaining configuration before launch

- [ ] Supabase project + env vars; promote the first admin account.
- [ ] Razorpay live keys, webhook URL + secret (account must be activated for UPI/cards/net banking).
- [ ] `APP_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- [ ] Real catalogue: products, weights, prices, stock, **licensed photos** (current images in `apps/web/public/images/dev`
      were cropped from the design concept and are development placeholders — see the README there).
      Hero/banner photos now come from `apps/web/public/images/site` (CC0 — sources in `LICENSES.md` there). They are
      downloaded by `apps/web/scripts/site-images.mjs` before every build if missing; run `npm run images -w apps/web`
      once and commit the `.webp` files so builds don't depend on the source site.
- [ ] Delivery PIN codes, fees, minimum order, slots/capacity; coupons (seed values are samples).
- [ ] Store name, logo, support phone/email/WhatsApp/address/hours, social links (Admin → Settings). Nothing is shown until set.
- [ ] Review the Returns, Privacy and Terms templates with a legal adviser and fill in the bracketed business details.
- [ ] Transactional email/SMS (order confirmations) — not included; hook into `order_events` or Supabase webhooks.
- [ ] App store assets, bundle IDs, privacy labels; optional native Razorpay SDK (needs an Expo development build).

## Known limitations

- Rate limiting is in-memory per server instance (use a shared store, e.g. Upstash, at scale).
- Admin inventory "set stock" overwrites the value (no stock movement ledger); admin lists show the latest 200 orders.
- Supabase-mode sign-in and live Razorpay calls are implemented to the documented APIs but couldn't be exercised here
  without credentials; everything else was run end-to-end (browser, local Postgres with the real migrations and RLS).
