# Google Play release — Rams Fresh Basket (Android)

Everything Claude could prepare is in this folder and in `apps/mobile/app.json` / `eas.json`.
The steps marked **Owner** need the store owner's own Google / Expo accounts, payments or business details.

## 0. Before the first upload (blockers)

| # | What | Who | Status |
|---|---|---|---|
| 1 | Merge PR #2 so the live API (https://fresh-basket-brown.vercel.app) has the app's endpoints, the 4 new migrations and **account deletion** | Owner | open |
| 2 | Replace the template text on `/privacy`, `/terms`, `/returns` (they show "[date]", "Template") — Play needs a real **privacy policy URL** | Owner (legal text) | open |
| 3 | Supabase: SMTP + `{{ .Token }}` in the *Confirm signup* / *Magic link* templates, Site URL = the live site (sign-up emails must work in the app) | Owner | open |
| 4 | Fill support phone / email in Admin → Settings (shown in the app and needed for the store listing "Contact details") | Owner | open |

## 1. Accounts (Owner)

1. **Google Play Console** developer account — https://play.google.com/console (one-time US$25, identity verification).
   *Personal* accounts created after Nov 2023 must run a **closed test with at least 12 testers for 14 days** before
   production access is granted. An *Organisation* account (needs a D-U-N-S number) doesn't have this rule.
2. **Expo account** — https://expo.dev (free) for the cloud build (EAS). The build machine here has no Android SDK.

## 2. Build the Android App Bundle (Owner's computer, ~15 min)

```bash
cd apps/mobile
npm install
npx eas-cli login                    # your Expo account
npx eas-cli build -p android --profile production
```

* `eas.json` → profile `production` builds an **.aab** and points the app at `https://fresh-basket-brown.vercel.app`.
* App id: **`com.ramavatar.freshbasket`** (can never change after the first upload). Name: **Rams Fresh Basket**.
* Let EAS create and keep the upload key ("Generate a new keystore" → yes). Back it up from expo.dev → Credentials.
* For a quick test on a phone first: `npx eas-cli build -p android --profile preview` (installable .apk).

## 3. Play Console — create the app

* App name: `Rams Fresh Basket` · Default language: English (India) · App · Free.
* **Store listing** (texts below, graphics in `store/android/`):
  * App icon: `android/icon-512.png` (512×512)
  * Feature graphic: `android/feature-graphic-1024x500.png`
  * Phone screenshots: `android/screenshots/*.png` (2–8 needed; 1080×1920)
* **App content**:
  * Privacy policy: `https://fresh-basket-brown.vercel.app/privacy` (after #2 above)
  * App access: sign-in needed for checkout → give a **test login** (create one test customer account for Google's reviewers)
  * Ads: **No ads**
  * Content rating questionnaire: shopping app, no violence/user-generated content except product reviews → expect "Everyone"
  * Target audience: 18+ (online ordering & payments)
  * Data safety: answers below
  * Account deletion: in-app (Profile → Delete account) **and** web link `https://fresh-basket-brown.vercel.app/delete-account`
  * Government / financial / health features: none
* **Testing → Closed testing**: create a track, upload the .aab, add ≥12 tester emails, run 14 days (personal accounts).
* **Production**: after the closed test, "Apply for production", then roll out.

## 4. Store listing text

**Short description (≤ 80 chars)**

> Fresh vegetables & fruits, delivered to your door. Order by weight, pay on delivery.

**Full description**

> Rams Fresh Basket brings fresh vegetables and fruits from our store to your home.
>
> • Shop daily vegetables, leafy greens, fruits, herbs and value combos
> • Choose the pack size you need — 100 g, 250 g, 500 g, 1 kg and more — with the price per kg shown
> • Check if we deliver to your PIN code and see the delivery fee before you order
> • Pick a delivery slot that suits you
> • Pay cash on delivery (or online where available)
> • Apply coupon codes
> • Track your order and reorder your regular basket in a tap
> • Save your delivery addresses
>
> Delivery is available in the areas listed in the app. Prices and stock are live from the store.

*(Owner: adjust the areas/payment lines to what you actually offer at launch.)*

## 5. Data safety form (what the app really does)

| Data type | Collected | Shared | Why | Optional? |
|---|---|---|---|---|
| Name | Yes | No | Account, delivery | Required for orders |
| Email address | Yes | No | Sign-in, order emails | Required |
| Phone number | Yes | No | Delivery updates | Required for orders |
| Address (delivery) | Yes | No | Delivery | Required for orders |
| Purchase history (orders) | Yes | No | Orders, reorder | Required |
| User-generated content (product reviews) | Yes | No | Reviews | Optional |

* Data is encrypted in transit (HTTPS): **Yes**.
* Users can request deletion: **Yes** — in-app and at `/delete-account`.
* Not collected: location (PIN code is typed), contacts, photos, device IDs, analytics, ads IDs, payment card data
  (online payments are handled by Razorpay's own checkout, not stored by the app).
* Third parties that process data on the store's behalf (service providers, not "sharing"): Supabase (sign-in),
  Vercel (hosting), Razorpay (online payments, if enabled), WhatsApp (only when the customer chooses WhatsApp ordering).

## 6. After launch

* Bump `expo.version` in `app.json` for each release (`versionCode` is increased by EAS automatically).
* `npx eas-cli build -p android --profile production` → `npx eas-cli submit -p android` (uploads to the *internal* track as a draft).
