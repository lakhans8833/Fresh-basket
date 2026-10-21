import { z } from "zod";
import { cookies } from "next/headers";
import { forbidden, json, parseBody, rateLimit, clientIp, route } from "@/lib/http";
import { env } from "@/lib/env";
import { DEV_COOKIE, devCookieOptions, issueDevToken } from "@/lib/auth";
import { queryOne } from "@/lib/db";

/**
 * DEVELOPMENT ONLY. Signs in by email without a password so the full flow can be
 * tested without Supabase Auth. Disabled whenever Supabase Auth is configured and
 * in production builds (unless ALLOW_DEV_MODE=true is set deliberately).
 */
const schema = z.object({ email: z.email().max(160).transform((e) => e.toLowerCase()), name: z.string().trim().max(80).optional() });

export const POST = route(async (req) => {
  if (env.auth.mode !== "dev") throw forbidden("Development login is disabled.");
  await rateLimit(`devlogin:${clientIp(req)}`, 30, 60_000);
  const { email, name } = await parseBody(req, schema);
  const user = await queryOne<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text))
     on conflict (email) do update set email = excluded.email returning id`,
    [email, name ?? null],
  );
  const token = issueDevToken(user!.id);
  (await cookies()).set(DEV_COOKIE, token, devCookieOptions);
  const profile = await queryOne("select id, email, full_name as \"fullName\", phone, role from profiles where id = $1", [user!.id]);
  // The token is also returned for the mobile app, which sends it as a Bearer token.
  return json({ profile, token });
});
