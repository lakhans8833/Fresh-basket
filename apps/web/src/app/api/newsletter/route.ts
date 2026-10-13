import { newsletterSchema } from "@freshbasket/shared";
import { clientIp, json, parseBody, rateLimit, route } from "@/lib/http";
import { query } from "@/lib/db";

export const POST = route(async (req) => {
  rateLimit(`newsletter:${clientIp(req)}`, 5, 60_000);
  const { email } = await parseBody(req, newsletterSchema);
  await query("insert into newsletter_subscribers (email) values ($1) on conflict do nothing", [email.toLowerCase()]);
  // Same response whether or not the email already existed (no list enumeration).
  return json({ ok: true });
});
