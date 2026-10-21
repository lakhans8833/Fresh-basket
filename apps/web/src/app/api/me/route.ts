import { profileUpdateSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { authUnavailable, getSession, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { deleteAccount, updateProfile } from "@/lib/account";
import { cookies } from "next/headers";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/http";
import { DEV_COOKIE, supabaseServerClient } from "@/lib/auth";
import { env } from "@/lib/env";

export const GET = route(async () => {
  const s = await getSession();
  // "Couldn't check" must not look like "signed out" (the client would drop the session).
  if (!s && (await authUnavailable())) throw new HttpError(503, "Sign-in service is temporarily unavailable. Please try again.", "AUTH_UNAVAILABLE");
  return json({ profile: s?.profile ?? null });
});

export const PUT = route(async (req) => {
  const s = await requireUser();
  const body = await parseBody(req, profileUpdateSchema);
  await updateProfile(s.userId, body);
  return json({ profile: (await getSession())?.profile });
});

/** Delete my account. The body must be {"confirm":"DELETE"} so it can't happen by accident. */
export const DELETE = route(async (req) => {
  const s = await requireUser();
  await rateLimit(`delete-account:${clientIp(req)}`, 5, 10 * 60_000);
  await parseBody(req, z.object({ confirm: z.literal("DELETE") }));
  const result = await deleteAccount(s.userId);
  // The login no longer exists: clear this browser's session cookies (the app just drops its token).
  const store = await cookies();
  store.delete(DEV_COOKIE);
  if (env.auth.mode === "supabase") await (await supabaseServerClient()).auth.signOut({ scope: "local" }).catch(() => undefined);
  return json({ deleted: true, ...result });
});
