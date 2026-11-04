# Performance Report

## Measured
| What | Value | How / when |
|---|---|---|
| Database query time (live) | 3 ms | `/api/health` 5 Nov |
| Function ↔ database | same region (`iad1` ↔ `us-east-1`) | `/api/health` |
| Live desktop | TTFB 0.3 s warm (2.2 s cold start), LCP 1.6 s | earlier round (docs/audit) |
| Lighthouse, mobile profile, **local build** (22 Oct) | Home 60, Shop 70, Product 68, Checkout 45; LCP 4.0–4.4 s; TBT 640–1010 ms; Checkout CLS 0.69 | `scratchpad/audit/lh` (older code; re-measure needed) |
| DB connection use | 1 connection per order-detail request (was 3); pool 3/instance | R8-02 |

## Findings
| ID | Status | Detail | Recommendation |
|---|---|---|---|
| P-01 | Confirmed (old measurement) | Mobile LCP ~4 s and high TBT on a throttled phone profile | Re-run Lighthouse on the live site from a real phone/PageSpeed Insights; the biggest levers are the hero image size on Home and client JS on Checkout |
| P-02 | Confirmed (22 Oct), **unverified now** | Checkout CLS 0.69 (layout moves while the quote loads) | Re-measure on the current checkout (layout changed since); reserve space for the summary if it persists |
| P-03 | Potential | ~200–250 ms network from India to `iad1` on every uncached request | Only fixable by moving database + functions together to Mumbai (`ap-south-1` + `bom1`); owner decision |
| P-04 | Fixed | Pooler connection exhaustion | R8-02 |
| P-05 | OK | Images via `next/image`, fonts self-hosted (`@fontsource`), static assets cached by Vercel | — |

## How to measure on the live site (owner, 2 minutes)
`https://pagespeed.web.dev/` → enter the shop address → "Analyze" → read the **Mobile** tab (LCP, INP, CLS).
Field data appears after enough real visitors.
