/**
 * Plain-language messages for the email-code sign-in (Supabase Auth `signInWithOtp` / `verifyOtp`).
 * Supabase answers a wrong code AND an expired / already-used / replaced code with the same
 * `otp_expired` error ("Token has expired or is invalid"), so the message covers all of those.
 */
export interface OtpError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/** Supabase lets an email code be 6–10 digits long (Auth → Providers → Email → "Email OTP Length"). */
export const OTP_MIN = 6;
export const OTP_MAX = 10;

/** Seconds Supabase asks us to wait before another email, when it says so ("…after 42 seconds"). */
export function waitSeconds(e: OtpError | null | undefined): number | null {
  const s = /(\d+)\s*seconds?/i.exec(e?.message ?? "")?.[1];
  return s ? Number(s) : null;
}

function isNetwork(e: OtpError) {
  // supabase-js reports fetch failures as AuthRetryableFetchError (status 0) instead of throwing.
  return e.name === "AuthRetryableFetchError" || e.status === 0 || /failed to fetch|network|load failed|timed? ?out/i.test(e.message ?? "");
}

export function sendErrorMessage(e: OtpError): string {
  const m = e.message ?? "";
  if (isNetwork(e)) return "Couldn't reach the sign-in service. Check your internet connection and try again.";
  if (e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit" || e.status === 429 || /rate|seconds|too many/i.test(m)) {
    const s = waitSeconds(e);
    return `Too many code requests. Please wait${s ? ` ${s} seconds` : " a minute"} and try again.`;
  }
  if (e.code === "signup_disabled" || /signups? not allowed|disabled/i.test(m)) return "New sign-ups are turned off for this store. Please contact the store.";
  if (e.code === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(m)) return "That email address doesn't look right. Please check it.";
  if (e.status && e.status >= 500) return "The sign-in service had a problem sending the email. Please try again in a minute.";
  return m || "Couldn't send the code. Please try again.";
}

export function verifyErrorMessage(e: OtpError): string {
  const m = e.message ?? "";
  if (isNetwork(e)) return "Couldn't reach the sign-in service. Check your internet connection, then tap Verify again — your code still works if it hasn't expired.";
  if (e.code === "otp_expired" || /expired|invalid|token/i.test(m)) {
    return "That code is wrong, has expired or was already used. Enter the code from the newest email, or send a new code.";
  }
  if (e.code === "over_request_rate_limit" || e.status === 429 || /rate|too many/i.test(m)) return "Too many attempts. Please wait a minute and try again.";
  if (e.status && e.status >= 500) return "The sign-in service had a problem. Please try again in a minute.";
  return m || "Couldn't check the code. Please try again.";
}
