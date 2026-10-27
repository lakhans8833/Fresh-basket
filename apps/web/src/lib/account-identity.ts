import "server-only";
import { createHmac } from "node:crypto";
import { env } from "./env";
import { emailLimitKey } from "./limit-keys";

/**
 * A keyed hash of a customer's email (one mailbox = one value: case, Gmail dots and "+tags" ignored),
 * kept after an account is deleted so its coupon history follows the same email to a new account.
 * Without APP_SECRET (local dev without one) it still works, keyed with a fixed string.
 */
export function emailIdentity(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return createHmac("sha256", env.appSecret ?? "fb-dev-identity").update(`coupon-identity:${emailLimitKey(email)}`).digest("hex");
}
