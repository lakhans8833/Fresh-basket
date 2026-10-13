import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { DEV_COOKIE, supabaseServerClient } from "@/lib/auth";
import { env } from "@/lib/env";

export const POST = route(async () => {
  (await cookies()).delete(DEV_COOKIE);
  if (env.auth.mode === "supabase") await (await supabaseServerClient()).auth.signOut();
  return json({ ok: true });
});
