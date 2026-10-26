# @freshbasket/web

Next.js website, admin panel (`/admin`) and the shared HTTP API (`/api`). See the repository root README for setup.


## Production customer email verification (Supabase dashboard — NOT applied by a deploy)

Customers verify their own email; the Admin “Confirm email” action is only a support fallback.
The app uses **numeric codes**:

| Flow | App call | Supabase email template that is sent |
| --- | --- | --- |
| “Email code” sign-in (new or existing customer) | `signInWithOtp` → `verifyOtp({ email, token, type: "email" })` | **Magic Link** (existing user) / **Confirm signup** (first time) |
| Password sign-up | `signUp` → `verifyOtp({ email, token, type: "signup" })` | **Confirm signup** |
| Unconfirmed customer signing in with a password | code screen → `resend({ type: "signup" })` | **Confirm signup** |
| Forgot password | `resetPasswordForEmail` → `/auth/callback` → `/reset-password` | **Reset password** (link) |

Configure the SAME Supabase project the production deployment uses (Project → Settings → API URL must
match `NEXT_PUBLIC_SUPABASE_URL` on Vercel):

1. **Authentication → URL Configuration**
   - Site URL: `https://fresh-basket-veg.vercel.app` (never `http://localhost:3000` in production —
     that is why expired links ended on localhost).
   - Redirect URLs: `https://fresh-basket-veg.vercel.app/auth/callback**` and `https://fresh-basket-veg.vercel.app/**`.
2. **Authentication → Providers → Email**: keep “Confirm email” ON. Email OTP Length: 6 (the form accepts
   6–10). Email OTP Expiration: 600–3600 s. Do not auto-confirm users to work around email problems.
3. **Authentication → Email Templates** — both **Magic Link** and **Confirm signup** must contain `{{ .Token }}`:

   ```html
   <h2>Your Fresh Basket code</h2>
   <p>Enter this code on the website:</p>
   <p style="font-size:30px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>The code works once. If you ask for a new code, this one stops working.</p>
   <p>If you did not request this email, ignore it.</p>
   ```

   A link is optional. Email security scanners may open links automatically, and opening the link uses up
   the code too — code-only emails are the most reliable. If you add one, it must go to the app callback with
   `token_hash`:
   - Confirm signup: `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm email</a>`
   - Magic Link: `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Sign in</a>`
   - Reset password: `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Set a new password</a>`
4. **Authentication → SMTP Settings**: the built-in sender allows only a few emails per hour and is meant for
   testing. Use a custom SMTP provider (e.g. Resend, Brevo, Amazon SES) with a verified sending domain for
   real customers; check the provider's logs if emails don't arrive.

   **Free alternative — the store sends the codes itself.** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS` and `MAIL_FROM` (see `.env.example`; e.g. a Gmail App password or a free Brevo account) plus
   `SUPABASE_SERVICE_ROLE_KEY`. The website and the phone app then ask `POST /api/auth/email`, which has
   Supabase create the code (Supabase sends nothing) and emails it from your own address. `GET /api/auth/config`
   shows `"emailCodes": "app"` when this is on. Limits: 1 email per address per 45 s (6 an hour), 10 per network
   per 10 min, 200 an hour for the shop.

Before release, use a disposable customer account: signup → code received → verification → session →
checkout, plus a wrong code, an expired code, a reused code and “Send a new code”. Do not reuse an old
link/code after requesting a fresh one.

## Order update notifications (WhatsApp Business Platform)

Customers who tick “Send me order updates on WhatsApp” get placed / packed / out-for-delivery / delivered
updates — one per order and event (duplicates are prevented in `order_notifications`). Server env vars
(Vercel → Settings → Environment Variables, not `NEXT_PUBLIC_`): `WHATSAPP_CLOUD_ACCESS_TOKEN`,
`WHATSAPP_CLOUD_PHONE_NUMBER_ID`, and one approved template name per event:
`WHATSAPP_TEMPLATE_ORDER_CONFIRMED`, `WHATSAPP_TEMPLATE_ORDER_PACKED`, `WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY`,
`WHATSAPP_TEMPLATE_ORDER_DELIVERED` (body variables: {{1}} first name, {{2}} order number, {{3}} tracking
link). Admin → Dashboard and each order show which of these are still missing. Tests use a mocked fetch;
never test with real customer numbers.
