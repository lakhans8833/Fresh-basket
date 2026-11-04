import "server-only";
import { HttpError } from "./http";

/**
 * FB-05 (optional): Cloudflare Turnstile on the email-code form, so a script can't use the store to send
 * sign-in emails in bulk. ON only when BOTH TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set; without
 * them nothing changes. The rate limits in /api/auth/email stay in force either way.
 * - Enforced for browser requests (Origin / Sec-Fetch-Site present). The phone app can't show the widget,
 *   so its requests (no browser headers) are not asked for a token — they keep the rate limits only.
 * - Cloudflare unreachable / 5xx → allowed (logged): an outage at Cloudflare must not block sign-in.
 */
export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SITE_KEY?.trim() && process.env.TURNSTILE_SECRET_KEY?.trim());
}

const fromBrowser = (req: Request) => Boolean(req.headers.get("origin") || req.headers.get("sec-fetch-site"));

export async function requireTurnstile(req: Request, token: string | null | undefined, ip: string): Promise<void> {
  if (!turnstileEnabled() || !fromBrowser(req)) return;
  if (!token) throw new HttpError(400, "Please complete the security check and try again.", "CAPTCHA_REQUIRED");
  let res: Response;
  try {
    res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      // remoteip only when it's a single address (IPv6 is grouped to a /64 for the rate limits).
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!.trim(), response: token, ...(/^[0-9a-f.:]+$/i.test(ip) ? { remoteip: ip } : {}) }).toString(),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    console.warn("[turnstile] siteverify unreachable — allowed:", e instanceof Error ? e.name : "error");
    return;
  }
  if (res.status >= 500) {
    console.warn("[turnstile] siteverify", res.status, "— allowed");
    return;
  }
  const out = (await res.json().catch(() => null)) as { success?: boolean; "error-codes"?: string[] } | null;
  if (out?.success === true) return;
  console.warn("[turnstile] rejected:", (out?.["error-codes"] ?? []).join(",") || res.status);
  throw new HttpError(400, "The security check didn't go through. Please try again.", "CAPTCHA_FAILED");
}
