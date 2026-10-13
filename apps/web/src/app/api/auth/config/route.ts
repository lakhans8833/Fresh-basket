import { json, route } from "@/lib/http";
import { env } from "@/lib/env";

/** Public auth configuration for web/mobile clients (no secrets). */
export const GET = route(async () =>
  json({
    mode: env.auth.mode,
    supabaseUrl: env.auth.mode === "supabase" ? env.auth.supabaseUrl : null,
    supabaseAnonKey: env.auth.mode === "supabase" ? env.auth.supabaseAnonKey : null,
  }),
);
