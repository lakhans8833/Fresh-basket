import { after } from "next/server";
import { z } from "zod";
import { clientIp, HttpError, json, parseBody, rateLimit, route } from "@/lib/http";
import { emailCodesBySmtp } from "@/lib/env";
import { sendAuthEmail } from "@/lib/auth-email";
import { emailLimitKey, ipNetworkKey } from "@/lib/limit-keys";
import { requireTurnstile } from "@/lib/turnstile";

const schema = z.object({
  action: z.enum(["signin", "signup", "resend", "recovery"]),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional().nullable(),
  password: z.string().min(8).max(72).optional().nullable(),
  /** Cloudflare Turnstile token — required from browsers only when Turnstile is configured (lib/turnstile.ts). */
  turnstileToken: z.string().max(2048).optional().nullable(),
});

/**
 * Sign-in / sign-up / password emails sent by this app over SMTP (free, e.g. Gmail) — only when SMTP
 * is set up (GET /api/auth/config says `emailCodes: "app"`). Otherwise clients use Supabase directly.
 *
 * Limits (protect the mailbox's daily allowance and stop anyone using the store to spam an address):
 * - per network (IPv6 grouped by /64 — not wider: mobile carriers put many customers in one /48): 10 per 10 min;
 * - per network + address: 1 per 45 s, 5 an hour;
 * - per address from anywhere: 15 an hour (Gmail dots and "+tags" count as the same address) — past
 *   that, a wider network (IPv6 /48 / IPv4 address) asking for the address for the first time this hour
 *   still gets one code, up to 10 more an hour (hard cap 25). A trade-off: nobody can flood an address,
 *   and locking its owner out takes more than 10 different networks every hour;
 * - per wider network (IPv6 /48): 60 an hour, so one network can't use up the shop-wide allowance;
 * - whole shop: 300 an hour (protects the mailbox's sending allowance).
 */
export const POST = route(async (req) => {
  if (!emailCodesBySmtp()) throw new HttpError(404, "Email codes are sent by Supabase on this store.", "EMAIL_BY_SUPABASE");
  const body = await parseBody(req, schema);
  const ip = clientIp(req); // IPv6 already grouped by /64
  await requireTurnstile(req, body.turnstileToken, ip);
  const to = emailLimitKey(body.email);
  await rateLimit(`auth-email:ip:${ip}`, 10, 10 * 60_000);
  await rateLimit(`auth-email:ip-to:${ip}:${to}`, 1, 45_000);
  await rateLimit(`auth-email:ip-to-hour:${ip}:${to}`, 5, 60 * 60_000);
  // Count requests for this address from this wider network (IPv6 /48) — no limit of its own.
  const fromHere = await rateLimit(`auth-email:net-to-hour:${ipNetworkKey(ip)}:${to}`, Number.MAX_SAFE_INTEGER, 60 * 60_000);
  try {
    await rateLimit(`auth-email:to-hour:${to}`, 15, 60 * 60_000);
  } catch (e) {
    // The address's hourly limit was used up — possibly by someone else. A network that hasn't asked for
    // this address yet this hour still gets one code (its first request), within a hard cap of 25 an
    // hour for the address: nobody can flood it, and a lockout needs more than 10 networks an hour.
    if (fromHere > 1) throw e;
    await rateLimit(`auth-email:to-hour-extra:${to}`, 10, 60 * 60_000);
  }
  // One wider network (IPv6 /48) may use at most a fifth of the shop's hourly emails, so a single cloud
  // allocation rotating /64s can't use up the whole allowance and block sign-in for every customer.
  // Generous on purpose: a mobile carrier can put many real customers in one /48 (IPv4 is already
  // limited per address above). Checked only after the per-caller limits, before the shop-wide cap.
  await rateLimit(`auth-email:net-hour:${ipNetworkKey(ip)}`, 60, 60 * 60_000);
  await rateLimit("auth-email:shop-hour", 300, 60 * 60_000);
  const send = () => sendAuthEmail(body.action, body.email, { name: body.name, password: body.action === "signup" ? body.password : null });
  if (body.action === "recovery") {
    // Answer at once whether or not the address has an account (timing would otherwise give it away);
    // the email goes out right after the response.
    let scheduled = false;
    try {
      after(() => send().catch((e) => console.error("[auth-email] recovery email failed", e instanceof Error ? e.message : e)));
      scheduled = true;
    } catch {
      /* outside a Next.js request (tests): send inline */
    }
    if (!scheduled) await send().catch(() => undefined);
    return json({ sent: true });
  }
  await send();
  return json({ sent: true });
});
