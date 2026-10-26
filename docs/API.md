# Fresh Basket HTTP API

Served by the Next.js app (`apps/web`) under `/api`. Used by the website and the mobile app.
Types for every response live in `packages/shared/src/types.ts`; request validation in
`packages/shared/src/schemas.ts`. All money is **integer paise** (₹32 = `3200`).

## Authentication

* **Web:** httpOnly cookies (Supabase Auth cookies, or `fb_dev_session` in development mode).
* **Mobile / other clients:** `Authorization: Bearer <token>`
  * Supabase mode → the Supabase access token (`supabase.auth.getSession()`).
  * Development mode → the `token` returned by `POST /api/auth/dev-login`.
* `GET /api/auth/config` → `{ mode: "supabase" | "dev" | "unconfigured", supabaseUrl, supabaseAnonKey }`
* `POST /api/auth/dev-login` `{ email, name? }` → `{ profile, token }` *(development mode only)*
* `POST /api/auth/logout`

Mutating requests from browsers must come from the same origin (CSRF check in `src/proxy.ts`).
Native apps send no `Origin` header and are unaffected.

Errors: `{ error: string, code?: string, details?: unknown }` with an HTTP status.
`409 ORDER_REJECTED` carries `details.messages`: `{ [variantId | "_cart" | "_coupon" | "_slot"]: message }`.

## Catalogue (public)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/settings` | `{ settings: StoreSettings, paymentMethods: ("razorpay"\|"mock"\|"cod")[] }` — only methods that work right now |
| GET | `/api/categories` | `{ categories: Category[] }` |
| GET | `/api/products?q=&category=<slug>&seasonal=1&featured=1&inStock=1&sort=featured\|price_asc\|price_desc\|name` | `{ products: ProductSummary[] }` |
| GET | `/api/products/:slug` | `{ product: ProductDetail }` |
| GET | `/api/delivery/check?pincode=560034` | `{ pincode, serviceable, area }` |
| GET | `/api/delivery/slots` | `{ slots: SlotOption[] }` (next N days, IST) |
| POST | `/api/quote` | body `{ items: [{variantId, quantity}], couponCode?, pincode? }` → `QuoteResponse` — **server-computed totals** |

Image URLs may be relative (`/images/dev/tomato.jpg`): prefix with the API base URL.

## Customer (auth required)

| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/api/me` | `{ profile }`; PUT `{ fullName, phone? }` |
| GET/POST | `/api/me/addresses` | `{ addresses }` / `{ address }` (body = `addressInputSchema`) |
| PUT/DELETE | `/api/me/addresses/:id` | |
| GET | `/api/me/buy-again` | `{ products, lastVariant }` — products from my past orders, newest first; `lastVariant[productId]` = pack bought last time |
| GET | `/api/orders` | `{ orders: Order[] }` |
| POST | `/api/orders` | body = `placeOrderSchema` → `PlaceOrderResponse` `{ order, payment? }` |
| GET | `/api/orders/:id` | `{ order }` (poll this after payment) |
| POST | `/api/orders/:id/cancel` | only before packing |
| POST | `/api/orders/:id/reorder` | `{ items: [{variantId, quantity}], skipped: string[] }` — add `items` to the cart |
| POST | `/api/orders/:id/pay` | resume payment for a `pending_payment` order → `{ order, payment }` |

### Payment flow

`POST /api/orders` with `paymentMethod`:
* `cod` → order is `placed` immediately.
* `razorpay` / `mock` → order is `pending_payment`, stock is held for 15 minutes, and the
  response includes `payment.payUrl` — a hosted page (`/pay/:orderId?t=<signed token>`).
  * Website: navigates to it.
  * Mobile app: opens it with `expo-web-browser` (`openAuthSessionAsync(payUrl + "&return=app", "freshbasket://")`),
    then polls `GET /api/orders/:id`. The order only becomes `placed`/`paid` after the server
    verifies the payment (signature + gateway lookup, or a signed webhook).

## Server-to-server

* `POST /api/webhooks/razorpay` — signed by Razorpay (`X-Razorpay-Signature`); idempotent.
* `POST /api/payments/razorpay/verify` — from the pay page after Razorpay checkout.
* `POST /api/payments/mock/complete` — development test payments only.
* `GET /api/cron/release-expired` — `Authorization: Bearer $CRON_SECRET`.

## Admin (role `admin`; `staff` can use orders, inventory, messages)

`/api/admin/stats`, `/api/admin/products[/:id]`, `/api/admin/categories[/:id]`,
`/api/admin/inventory` (GET, PATCH), `/api/admin/orders[/:id]` (GET, PATCH `{status, note?}` or `{paymentStatus}`),
`/api/admin/delivery/areas[/:id]`, `/api/admin/delivery/slots[/:id]`, `/api/admin/coupons[/:id]`,
`/api/admin/settings` (GET, PUT), `/api/admin/upload` (multipart `file`), `/api/admin/messages[/:id]`.
