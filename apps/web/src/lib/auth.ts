import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Profile } from "@freshbasket/shared";
import { env } from "./env";
import { queryOne } from "./db";
import { forbidden, unauthorized } from "./http";
import { issueToken, readToken } from "./tokens";

export const DEV_COOKIE = "fb_dev_session";
/** Set by src/proxy.ts after it verified/refreshed the Supabase session (client values are stripped). */
export const ACCESS_HEADER = "x-fb-sb-access-token";
const DEV_TTL = 60 * 60 * 24 * 7;

export interface Session {
  userId: string;
  profile: Profile;
}

export function issueDevToken(userId: string) {
  return issueToken("dev", { sub: userId }, DEV_TTL);
}
export const devCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.isProd,
  path: "/",
  maxAge: DEV_TTL,
};

export async function supabaseServerClient() {
  const store = await cookies();
  return createServerClient(env.auth.supabaseUrl!, env.auth.supabaseAnonKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component: cookies are read-only there; the proxy refreshes them.
        }
      },
    },
  });
}

async function resolveUserId(): Promise<{ id: string; email: string | null } | null> {
  const h = await headers();
  const bearer = h.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  if (env.auth.mode === "dev") {
    const store = await cookies();
    const token = bearer ?? store.get(DEV_COOKIE)?.value;
    const data = readToken<{ sub: string }>("dev", token);
    return data ? { id: data.sub, email: null } : null;
  }

  if (env.auth.mode === "supabase") {
    if (bearer) {
      const sb = createClient(env.auth.supabaseUrl!, env.auth.supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await sb.auth.getUser(bearer);
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    }
    // Cookie sessions: the proxy (src/proxy.ts) has already refreshed the session if needed and
    // passes the current access token in an internal header. Only verify it here — never refresh
    // in route handlers / server components, or parallel requests would reuse one refresh token
    // and Supabase would revoke the whole session.
    const token = h.get(ACCESS_HEADER);
    if (!token) return null;
    const sb = createClient(env.auth.supabaseUrl!, env.auth.supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await sb.auth.getUser(token);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  return null;
}

type ProfileRow = { id: string; email: string | null; full_name: string | null; phone: string | null; role: Profile["role"] };

export async function getSession(): Promise<Session | null> {
  const u = await resolveUserId();
  if (!u) return null;
  let row = await queryOne<ProfileRow>("select id, email, full_name, phone, role from profiles where id = $1", [u.id]);
  if (!row && env.auth.mode === "supabase") {
    row = await queryOne<ProfileRow>(
      "insert into profiles (id, email) values ($1, $2) on conflict (id) do update set email = excluded.email returning id, email, full_name, phone, role",
      [u.id, u.email],
    );
  }
  if (!row) return null;
  return {
    userId: row.id,
    profile: { id: row.id, email: row.email, fullName: row.full_name, phone: row.phone, role: row.role },
  };
}

export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) throw unauthorized();
  return s;
}

/** Staff: orders + inventory. */
export async function requireStaff(): Promise<Session> {
  const s = await requireUser();
  if (s.profile.role !== "admin" && s.profile.role !== "staff") throw forbidden();
  return s;
}

/** Admin: everything, including catalogue, delivery, coupons and settings. */
export async function requireAdmin(): Promise<Session> {
  const s = await requireUser();
  if (s.profile.role !== "admin") throw forbidden();
  return s;
}
