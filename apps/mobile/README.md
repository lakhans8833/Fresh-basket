# Fresh Basket — mobile app

Expo (SDK 57) + React Native + TypeScript app for Android and iOS, using **expo-router**.
It talks to the Fresh Basket HTTP API served by `apps/web` (see `docs/API.md`).

> This folder is **not** part of the root npm workspaces. It has its own `package.json`
> and `node_modules`. Shared types, schemas and helpers are imported straight from
> `packages/shared/src` via the `@shared/*` alias (see `tsconfig.json` and `metro.config.js`).

## Setup

```bash
cd apps/mobile
npm install
cp .env.example .env    # then edit EXPO_PUBLIC_API_URL if needed
```

Start the API first (from the repo root: `npm run dev`, which serves http://localhost:3000).

### `EXPO_PUBLIC_API_URL`

| Where the app runs        | Value                                   |
|---------------------------|-----------------------------------------|
| iOS simulator / web       | `http://localhost:3000` (default)       |
| Android emulator          | `http://10.0.2.2:3000`                  |
| Physical phone (Expo Go)  | `http://<your computer's LAN IP>:3000`  |

The phone and the computer must be on the same network. Restart `expo start` after changing `.env`
(`EXPO_PUBLIC_*` values are inlined at bundle time). For web preview on port 8081, the API must allow
that origin (`EXTRA_ALLOWED_ORIGINS=http://localhost:8081` in `apps/web`).

## Run

```bash
npx expo start            # QR code for Expo Go; press a = Android, i = iOS, w = web
npx expo start --android  # Android emulator
npx expo start --ios      # iOS simulator (macOS + Xcode)
npx expo start --web      # browser preview at http://localhost:8081
```

Checks:

```bash
npx tsc --noEmit                    # typecheck (includes packages/shared/src)
npx expo export --platform web      # proves Metro bundles everything (also --platform android)
```

## Structure

```
src/app/                 expo-router routes
  _layout.tsx            fonts (Fraunces + Inter), splash, providers, root stack
  (tabs)/                Home, Categories, Orders, Profile (bottom tabs)
  product/[slug].tsx     product details, gallery, weight options, add to basket
  cart.tsx               basket with server quote, coupon, PIN code
  checkout.tsx           address, slot, payment method, place order
  orders/[id].tsx        tracking timeline, cancel, complete payment (polls while pending)
  addresses.tsx          saved addresses (add / edit / delete / default)
  login.tsx              dev login or Supabase email + password
src/components/          Button, ProductCard, QuantityStepper, PriceRow, States, Skeleton, Chip, ScreenHeader, ...
src/lib/                 api client, auth, cart, settings, favourites, payment helpers
src/theme/               colour tokens, fonts, spacing
```

## Behaviour notes

* **Prices.** Totals always come from `POST /api/quote` (server). The app shows a stored
  `priceHint` only until the quote arrives. Quote issues (`quote.messages`) are shown per line,
  and checkout stays disabled until the basket is valid.
* **Auth.** On start the app calls `GET /api/auth/config`.
  * `dev` → "Development login": an email (or the *Sample customer* button) calls
    `POST /api/auth/dev-login`. The token is kept in `expo-secure-store` (AsyncStorage on web).
  * `supabase` → email + password via `@supabase/supabase-js` (session in AsyncStorage).
    `session.access_token` is sent as the Bearer token.
* **Idempotency.** Each order attempt sends a fresh `idempotencyKey`. The key stays the same
  for retries of the same request and is regenerated whenever the order contents change.
* **Deep links.** The app scheme is `freshbasket`. `freshbasket://orders/<id>` opens the order screen.

## Payments

Online payments (Razorpay, or the development-only **mock** gateway) do **not** use a native SDK.
After `POST /api/orders` returns `payment.payUrl`, the app clears the basket, opens the order screen and calls

```ts
WebBrowser.openAuthSessionAsync(payUrl + "&return=app", "freshbasket://")
```

The server-hosted pay page runs Razorpay Checkout in the in-app browser, then redirects to
`freshbasket://orders/<id>`, which closes the browser. The order screen polls `GET /api/orders/:id`
every 4 seconds while the status is `pending_payment`. The order only becomes paid after the
**server** verifies the payment. "Complete payment" on a pending order calls `POST /api/orders/:id/pay`
and reopens the pay page.

This works in **Expo Go**. A native Razorpay SDK (`react-native-razorpay`) would need a
development build (`npx expo run:android` / `eas build --profile development`), and it is not used here.
On web preview the pay page opens in a new tab instead.

## Building with EAS

```bash
npm i -g eas-cli   # or: npx eas-cli@latest ...
eas login
eas build:configure
eas build --profile development --platform android   # dev client
eas build --profile production --platform all
```

Set `EXPO_PUBLIC_API_URL` for each profile in `eas.json` (`"env": { "EXPO_PUBLIC_API_URL": "https://your-domain" }`).
Use HTTPS in production: Android blocks cleartext HTTP in release builds.
Bundle ids `com.freshbasket.app` in `app.json` are **placeholders**. Change them before publishing.

## Placeholders

`assets/icon.png`, `assets/splash-icon.png`, `assets/android-icon-*.png` and `assets/favicon.png` are
**generated placeholders** (a lime leaf on forest green). Replace them with real brand artwork before release.
