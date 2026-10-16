import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { RECOVERY_COOKIE } from "@/lib/tokens";

/** Called after the new password is saved: the one-time "just opened a recovery link" mark is used up. */
export const POST = route(async () => {
  (await cookies()).delete(RECOVERY_COOKIE);
  return json({ ok: true });
});
