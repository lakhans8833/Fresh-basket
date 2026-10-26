import { z } from "zod";
import { clientIp, HttpError, json, parseBody, rateLimit, route } from "@/lib/http";
import { emailCodesBySmtp } from "@/lib/env";
import { sendAuthEmail } from "@/lib/auth-email";

const schema = z.object({
  action: z.enum(["signin", "signup", "resend", "recovery"]),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional().nullable(),
  password: z.string().min(8).max(72).optional().nullable(),
});

/**
 * Sign-in / sign-up / password emails sent by this app over SMTP (free, e.g. Gmail) — only when SMTP
 * is set up (GET /api/auth/config says `emailCodes: "app"`). Otherwise clients use Supabase directly.
 * Limits: per network, per email address, and for the whole shop per hour (protects the mailbox's
 * daily sending allowance and stops anyone using the store to spam an address).
 */
export const POST = route(async (req) => {
  if (!emailCodesBySmtp()) throw new HttpError(404, "Email codes are sent by Supabase on this store.", "EMAIL_BY_SUPABASE");
  const body = await parseBody(req, schema);
  await rateLimit(`auth-email:ip:${clientIp(req)}`, 10, 10 * 60_000);
  await rateLimit(`auth-email:to:${body.email}`, 1, 45_000);
  await rateLimit(`auth-email:to-hour:${body.email}`, 6, 60 * 60_000);
  await rateLimit("auth-email:shop-hour", 200, 60 * 60_000);
  await sendAuthEmail(body.action, body.email, { name: body.name, password: body.action === "signup" ? body.password : null });
  return json({ sent: true });
});
