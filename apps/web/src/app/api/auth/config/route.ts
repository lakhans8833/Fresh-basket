import { json, route } from "@/lib/http";
import { emailCodesBySmtp, env } from "@/lib/env";

/** Public auth configuration for web/mobile clients (no secrets). */
export const GET = route(async () =>
  json({
    mode: env.auth.mode,
    supabaseUrl: env.auth.mode === "supabase" ? env.auth.supabaseUrl : null,
    supabaseAnonKey: env.auth.mode === "supabase" ? env.auth.supabaseAnonKey : null,
    /** "app": sign-in / sign-up codes are emailed by this server (POST /api/auth/email); "supabase": by Supabase. */
    emailCodes: emailCodesBySmtp() ? "app" : "supabase",
  }),
);
