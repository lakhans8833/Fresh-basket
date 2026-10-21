import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { DEV_COOKIE, supabaseServerClient } from "@/lib/auth";
import { env } from "@/lib/env";
import { RECOVERY_COOKIE } from "@/lib/tokens";

export const POST = route(async () => {
  const store = await cookies();
  store.delete(DEV_COOKIE);
  store.delete(RECOVERY_COOKIE); // a finished session is no longer "just recovered"
  // This device only (other devices of the same account stay signed in).
  if (env.auth.mode === "supabase") await (await supabaseServerClient()).auth.signOut({ scope: "local" });
  return json({ ok: true });
});
