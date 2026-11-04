# Test Results (5 Nov 2026, branch `audit/round-8`)

All numbers below come from runs in this session; nothing is estimated. Local runs use isolated test databases
(`freshbasket_test`, `fb_ui`, `fb_auth`) and fake Supabase Auth servers — no real customer, payment or email.

| Suite | Command / script | Result |
|---|---|---|
| Lint | `eslint` (web) | PASS |
| TypeScript | `tsc --noEmit` web, shared, mobile | PASS |
| Unit + integration (web) | `vitest run` — 31 files | **261 / 261** |
| Unit (shared) | `vitest run` | 52 / 52 |
| Production build | `next build` | PASS |
| Email-code sign-in (Supabase mode) | `e2e/email_otp.py` | 20 / 20 |
| Sign-up with code | `e2e/signup_code.py` | 7 / 7 |
| Password sign-in + forgot password | `e2e/login_recovery.py` | 28 / 28 |
| Admin session refresh (token expiry, parallel calls) | `e2e/session_refresh.py` | PASS (stayed signed in) |
| Unconfirmed email → resend | `e2e/resend_confirmation.py` | PASS |
| QA plan (customer + admin journeys) | `qa_plan.py` | 89 pass, 0 fail |
| Store features | `store` | 37 / 37 |
| Order flow / checkout retry | `flow`, `checkout_retry` | PASS / PASS |
| Customer + admin page sweeps (390, 1366/1280 px) | sweeps | PASS (only expected 409 on category delete) |
| Product cards (1920 px) | `cards` | 90 cards, 0 bad |
| Responsive + accessibility (axe, 9 sizes) | `resp.py` | 333 checks, 0 serious/critical |
| Keyboard | `kbd.py` | 12 / 12 |
| Shopper features | `shopper` | 19 / 19 |
| Admin hydration / charts | | 5 / 5, 17 / 17 |
| WhatsApp order (website) | `e2e/whatsapp.py` | PASS |
| After-delivery refund/replacement | `e2e/after_delivery.py` | 14 / 14 |
| Race / API security matrix | `race.py`, `api_matrix.py` | 0 failures (only expected 503: set-password without Supabase locally) |
| Policy pages | `e2e/policy_pages.py` | 35 / 35 |
| Deep check 4 | `deep_check_4` | 6 / 6 |
| Phone app smoke / sign-in (web build) | `apps/mobile/e2e/smoke.py`, `auth_mock.py` | 13 / 13, 13 / 13 |
| **Phone app: order on WhatsApp (new)** | `apps/mobile/e2e/whatsapp_order.py` | **9 / 9** (first run failed on an ambiguous test locator; fixed in the test, re-run passed) |
| Phone/tablet emulation (iPhone SE/15, Pixel 7, Galaxy S9+, iPad Mini) | `devices.py` | 90 / 90 page loads clean (4 Nov) |
| Expo native bundles | `expo export --platform ios --platform android` | PASS |
| Live read-only checks | browser | 84/84 public pages 200, 14 admin APIs 200 with session / 401 without, 0 runtime errors (24 h) |

## Not run (and why)
- Real Razorpay payments: online payments are off on the live store; Razorpay code is covered by signature /
  amount / duplicate-event integration tests with test secrets.
- Real iOS Safari / real Android devices: not available here (Chromium emulation used).
- Phone-network Lighthouse against the live site: the live site is not reachable from the test machine; local
  figures are in `PERFORMANCE_REPORT.md`.
