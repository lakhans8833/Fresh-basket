import { profileUpdateSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { authUnavailable, getSession, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { updateProfile } from "@/lib/account";

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
