import { after } from "next/server";
import { z } from "zod";
import { clientIp, HttpError, json, parseBody, rateLimit, route } from "@/lib/http";
import { emailCodesBySmtp } from "@/lib/env";
import { sendAuthEmail } from "@/lib/auth-email";
import { emailLimitKey, ipLimitKey } from "@/lib/limit-keys";

const schema = z.object({
  action: z.enum(["signin", "signup", "resend", "recovery"]),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional().nullable(),
  password: z.string().min(8).max(72).optional().nullable(),
});

/**
 * Sign-in / sign-up / password emails sent by this app over SMTP (free, e.g. Gmail) — only when SMTP
 * is set up (GET /api/auth/config says `emailCodes: "app"`). Otherwise clients use Supabase directly.
 *
 * Limits (protect the mailbox's daily allowance and stop anyone using the store to spam an address):
 * - per network (IPv6 grouped by /64): 10 per 10 min;
 * - per network + address: 1 per 45 s, 5 an hour — so someone else hammering YOUR address from their
 *   network doesn't use up your own allowance;
 * - per address from anywhere: 15 an hour (Gmail dots and "+tags" count as the same address);
 * - whole shop: 300 an hour.
 */
export const POST = route(async (req) => {
  if (!emailCodesBySmtp()) throw new HttpError(404, "Email codes are sent by Supabase on this store.", "EMAIL_BY_SUPABASE");
  const body = await parseBody(req, schema);
  const ip = ipLimitKey(clientIp(req));
  const to = emailLimitKey(body.email);
  await rateLimit(`auth-email:ip:${ip}`, 10, 10 * 60_000);
  await rateLimit(`auth-email:ip-to:${ip}:${to}`, 1, 45_000);
  await rateLimit(`auth-email:ip-to-hour:${ip}:${to}`, 5, 60 * 60_000);
  await rateLimit(`auth-email:to-hour:${to}`, 15, 60 * 60_000);
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
