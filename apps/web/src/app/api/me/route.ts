import { profileUpdateSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { getSession, requireUser } from "@/lib/auth";
import { updateProfile } from "@/lib/account";

export const GET = route(async () => {
  const s = await getSession();
  return json({ profile: s?.profile ?? null });
});

export const PUT = route(async (req) => {
  const s = await requireUser();
  const body = await parseBody(req, profileUpdateSchema);
  await updateProfile(s.userId, body);
  return json({ profile: (await getSession())?.profile });
});
