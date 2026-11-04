import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { supabaseServerClient } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { RECOVERY_COOKIE, RECOVERY_TTL_SECONDS, recoveryToken } from "@/lib/tokens";
import { BRAND_NAME } from "@freshbasket/shared";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Where a failed email link lands: the sign-in page with a reason it can explain. */
function loginErrorUrl(origin: string, reason: "expired" | "link" | "device", next?: string | null) {
  const u = new URL("/login", origin);
  u.searchParams.set("error", reason);
  if (next) u.searchParams.set("next", safeNextPath(next));
  return u;
}

/**
 * Supabase Auth email links (confirm sign-up, magic link, password reset) land here.
 * - `?token_hash=…&type=…` (recommended email templates): verified on the server, so the link works on
 *   ANY device or browser — e.g. opened from the Gmail app on a phone. S-21 (login CSRF): a GET only shows
 *   a "Continue signing in?" page; the token is verified when that page's form POSTs back from this site.
 *   Otherwise anyone could send a victim THEIR OWN sign-in link (or embed it in an <img>) and silently sign
 *   the victim's browser into the attacker's account. (Bonus: mail scanners that open links no longer use them up.)
 * - `?code=…` (default templates, PKCE): works only in the browser that asked for the email, so it can't
 *   be planted on someone else — still handled on GET.
 * - `?error=…&error_code=otp_expired` (link already used or too old): explained on the sign-in page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const type = sp.get("type") as EmailOtpType | null;
  const tokenHash = sp.get("token_hash");
  if (tokenHash && type && OTP_TYPES.includes(type) && !(sp.get("error_code") ?? sp.get("error")) && env.auth.mode === "supabase") {
    const next = sp.get("next") ?? (type === "recovery" ? "/reset-password" : null);
    return confirmPage({ tokenHash, type, next: next ? safeNextPath(next) : null });
  }
  return handle(url, { type, next: sp.get("next"), tokenHash: null, code: sp.get("code"), errorCode: sp.get("error_code") ?? sp.get("error") });
}

/** The confirm page's form. Only from this site: a cross-site form post (Origin of another site, or none). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  // Origin "null" (privacy modes) or missing: fall back to Sec-Fetch-Site, which every current browser sends.
  const sameSite = origin && origin !== "null" ? origin === url.origin : site === "same-origin";
  if (!sameSite) return new NextResponse("Cross-site request blocked.", { status: 403, headers: { "cache-control": "no-store" } });
  const form = await req.formData().catch(() => null);
  const field = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v !== "" ? v : null;
  };
  const type = field("type") as EmailOtpType | null;
  const tokenHash = field("token_hash");
  const res = await handle(url, { type, next: field("next"), tokenHash: tokenHash && type && OTP_TYPES.includes(type) ? tokenHash : null, code: null, errorCode: null });
  // 303: the browser follows with a GET (a 307 would re-POST the token to the next page).
  return NextResponse.redirect(res.headers.get("location")!, { status: 303, headers: res.headers });
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");

/** Minimal same-origin page (no scripts) with one button that POSTs the link back here. */
function confirmPage({ tokenHash, type, next }: { tokenHash: string; type: EmailOtpType; next: string | null }) {
  const recovery = type === "recovery";
  const title = recovery ? "Reset your password?" : type === "signup" || type === "invite" ? "Confirm your email?" : "Continue signing in?";
  const button = recovery ? "Continue to reset password" : "Continue";
  const hidden = (k: string, v: string) => `<input type="hidden" name="${k}" value="${esc(v)}">`;
  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · ${esc(BRAND_NAME)}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f8f4;color:#1c2b20;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{background:#fff;border:1px solid #e3e8e0;border-radius:16px;max-width:400px;width:100%;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.brand{font-weight:700;color:#2f7d32;font-size:15px;margin:0 0 18px}h1{font-size:21px;margin:0 0 8px}p{margin:0 0 20px;line-height:1.5;color:#4a5a4e;font-size:15px}
button{width:100%;font:inherit;font-weight:600;font-size:16px;padding:12px 16px;border:0;border-radius:10px;background:#2f7d32;color:#fff;cursor:pointer}button:hover{background:#276b2a}
a{display:block;text-align:center;margin-top:14px;color:#4a5a4e;font-size:14px}
</style></head>
<body><main>
<p class="brand">${esc(BRAND_NAME)}</p>
<h1>${esc(title)}</h1>
<p>You opened a sign-in link from ${esc(BRAND_NAME)}. Continue only if you asked for this email just now.</p>
<form method="post" action="/auth/callback">${hidden("token_hash", tokenHash)}${hidden("type", type)}${next ? hidden("next", next) : ""}
<button type="submit">${esc(button)}</button></form>
<a href="/">Cancel</a>
</main></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "same-origin", "x-robots-tag": "noindex" },
  });
}

async function handle(url: URL, p: { type: EmailOtpType | null; next: string | null; tokenHash: string | null; code: string | null; errorCode: string | null }) {
  const { type, tokenHash, code, errorCode } = p;
  const fallbackNext = type === "recovery" ? "/reset-password" : null;
  const next = p.next ?? fallbackNext;
  const safeNext = safeNextPath(next);
  // A recovery link: Supabase says so (type=recovery), or a PKCE code link (no type) sent to the reset page.
  // A token_hash link of another type (e.g. someone's own magic link with next=/reset-password) must not
  // put this browser into "set a new password" mode — that would help sign a victim into the sender's
  // account (login CSRF). A PKCE code only works in the browser that requested it, so it can't be planted.
  const isRecovery = type === "recovery" || (!type && Boolean(code) && safeNext.startsWith("/reset-password"));

  /** Signed in through the link: go on, and for recovery mark THIS browser + user as recovering. */
  const success = (userId: string | undefined) => {
    const res = NextResponse.redirect(new URL(safeNext, url.origin));
    if (isRecovery && userId) {
      res.cookies.set(RECOVERY_COOKIE, recoveryToken.issue(userId), {
        httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: RECOVERY_TTL_SECONDS,
      });
    }
    return res;
  };

  if (errorCode) {
    return NextResponse.redirect(loginErrorUrl(url.origin, /expired/i.test(errorCode) ? "expired" : "link", next));
  }
  if (env.auth.mode !== "supabase") return NextResponse.redirect(loginErrorUrl(url.origin, "link", next));

  const sb = await supabaseServerClient();
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return success(data.user?.id);
    console.warn("[auth/callback] verifyOtp failed:", error.code ?? error.message);
    return NextResponse.redirect(loginErrorUrl(url.origin, /expired|invalid/i.test(`${error.code} ${error.message}`) ? "expired" : "link", next));
  }

  if (code) {
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return success(data.user?.id);
    console.warn("[auth/callback] code exchange failed:", error.code ?? error.message);
    // PKCE: the link was opened in a different browser/app than the one that asked for it.
    const device = /verifier|pkce/i.test(`${error.code} ${error.message}`);
    return NextResponse.redirect(loginErrorUrl(url.origin, device ? "device" : /expired/i.test(`${error.code} ${error.message}`) ? "expired" : "link", next));
  }
  return NextResponse.redirect(loginErrorUrl(url.origin, "link", next));
}
