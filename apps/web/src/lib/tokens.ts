import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireAppSecret } from "./env";

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function sign(purpose: string, payload: string) {
  return createHmac("sha256", requireAppSecret()).update(`${purpose}.${payload}`).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Compact signed token: `<purpose>.<payload>.<sig>`; payload = base64url(JSON). */
export function issueToken(purpose: string, data: Record<string, unknown>, ttlSeconds: number): string {
  const payload = b64(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${purpose}.${payload}.${sign(purpose, payload)}`;
}

export function readToken<T extends Record<string, unknown>>(purpose: string, token: string | null | undefined): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== purpose) return null;
  const [, payload, sig] = parts as [string, string, string];
  if (!safeEqual(sig, sign(purpose, payload))) return null;
  try {
    const data = JSON.parse(unb64(payload)) as T & { exp: number };
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

/** Token that lets a specific order's payment page be opened (e.g. from the mobile app). */
export const payToken = {
  issue: (orderId: string) => issueToken("pay", { o: orderId }, 60 * 60),
  verify: (orderId: string, token: string | null | undefined) => readToken<{ o: string }>("pay", token)?.o === orderId,
};

/**
 * Proof that THIS browser just completed a password-recovery email link for a specific account.
 * Set (httpOnly) by /auth/callback after a successful recovery verification; the reset page only offers
 * "set a new password" recovery mode when it matches the signed-in user. A session alone is not proof.
 */
export const RECOVERY_COOKIE = "fb_recovery";
export const RECOVERY_TTL_SECONDS = 15 * 60;
export const recoveryToken = {
  issue: (userId: string) => issueToken("recovery", { u: userId }, RECOVERY_TTL_SECONDS),
  verify: (userId: string, token: string | null | undefined) => readToken<{ u: string }>("recovery", token)?.u === userId,
};

/**
 * Secret order-tracking key (sent to the customer, e.g. in the WhatsApp message). Deterministic
 * per order so the same link always works; only the server (APP_SECRET) can make one.
 * Anyone holding the link sees that one order's status and items — never other customers' data,
 * and the address is masked on the tracking page.
 */
export const trackToken = {
  issue: (orderId: string) => sign("track", orderId).slice(0, 32),
  verify: (orderId: string, key: string | null | undefined) => typeof key === "string" && key.length === 32 && safeEqual(key, sign("track", orderId).slice(0, 32)),
};
