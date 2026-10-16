import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { supabaseServerClient } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { RECOVERY_COOKIE, RECOVERY_TTL_SECONDS, recoveryToken } from "@/lib/tokens";

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
 *   ANY device or browser — e.g. opened from the Gmail app on a phone.
 * - `?code=…` (default templates, PKCE): works only in the browser that asked for the email.
 * - `?error=…&error_code=otp_expired` (link already used or too old): explained on the sign-in page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const type = sp.get("type") as EmailOtpType | null;
  const fallbackNext = type === "recovery" ? "/reset-password" : null;
  const next = sp.get("next") ?? fallbackNext;
  const safeNext = safeNextPath(next);
  // A recovery link: Supabase says so (type=recovery), or a code link that was sent to the reset page.
  const isRecovery = type === "recovery" || safeNext.startsWith("/reset-password");

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

  const errorCode = sp.get("error_code") ?? sp.get("error");
  if (errorCode) {
    return NextResponse.redirect(loginErrorUrl(url.origin, /expired/i.test(errorCode) ? "expired" : "link", next));
  }
  if (env.auth.mode !== "supabase") return NextResponse.redirect(loginErrorUrl(url.origin, "link", next));

  const sb = await supabaseServerClient();
  const tokenHash = sp.get("token_hash");
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return success(data.user?.id);
    console.warn("[auth/callback] verifyOtp failed:", error.code ?? error.message);
    return NextResponse.redirect(loginErrorUrl(url.origin, /expired|invalid/i.test(`${error.code} ${error.message}`) ? "expired" : "link", next));
  }

  const code = sp.get("code");
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
