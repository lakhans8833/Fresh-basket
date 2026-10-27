import "server-only";
import { cache } from "react";
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
/** Set by src/proxy.ts: the requested path + query (client values are stripped). */
export const PATH_HEADER = "x-fb-path";
/** Set by the proxy when Supabase Auth couldn't be reached to check this request's session. */
export const AUTH_UNAVAILABLE_HEADER = "x-fb-auth-unavailable";

/**
 * True when this request's session couldn't be checked because Supabase Auth was unreachable or
 * failing (as opposed to "no session"). /api/me turns it into a 503 so the browser keeps the session
 * and offers a retry instead of signing the customer or admin out.
 */
export async function authUnavailable(): Promise<boolean> {
  if (env.auth.mode !== "supabase") return false;
  if ((await headers()).get(AUTH_UNAVAILABLE_HEADER) === "1") return true;
  return (await sessionState()).unavailable;
}
/** verifyAccessToken result when Supabase Auth couldn't be asked (network / 5xx) — not "no session". */
const UNAVAILABLE = "unavailable" as const;
const retryable = (e: { name?: string; status?: number } | null | undefined) =>
  Boolean(e && (e.name === "AuthRetryableFetchError" || e.status === 0 || (typeof e.status === "number" && e.status >= 500)));
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

async function resolveUserId(): Promise<{ id: string; email: string | null } | typeof UNAVAILABLE | null> {
  const h = await headers();
  const bearer = h.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  if (env.auth.mode === "dev") {
    const store = await cookies();
    const token = bearer ?? store.get(DEV_COOKIE)?.value;
    const data = readToken<{ sub: string }>("dev", token);
    return data ? { id: data.sub, email: null } : null;
  }

  if (env.auth.mode === "supabase") {
    // Admin pages and APIs ask Supabase Auth itself, so a signed-out-everywhere, banned or deleted
    // staff account stops working at once (not only when its access token expires).
    const path = h.get(PATH_HEADER) ?? "";
    const strict = /^\/(api\/)?admin(\/|$|\?)/.test(path);
    if (bearer) return verifyAccessToken(bearer, strict);
    // Cookie sessions: the proxy (src/proxy.ts) has already refreshed the session if needed and
    // passes the current access token in an internal header. Only verify it here — never refresh
    // in route handlers / server components, or parallel requests would reuse one refresh token
    // and Supabase would revoke the whole session.
    const token = h.get(ACCESS_HEADER);
    return token ? verifyAccessToken(token, strict) : null;
  }
  return null;
}

let verifier: ReturnType<typeof createClient> | null = null;
/**
 * Verifies a Supabase access token. getClaims() checks the signature locally with the project's
 * public signing keys (cached), falling back to Supabase Auth for legacy shared-secret projects.
 * Never refreshes anything (see src/proxy.ts).
 */
async function verifyAccessToken(token: string, strict = false): Promise<{ id: string; email: string | null } | typeof UNAVAILABLE | null> {
  verifier ??= createClient(env.auth.supabaseUrl!, env.auth.supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  if (strict) {
    const { data, error } = await verifier.auth.getUser(token);
    if (!data.user && retryable(error)) return UNAVAILABLE;
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  const { data, error } = await verifier.auth.getClaims(token);
  if (!data?.claims?.sub && retryable(error)) return UNAVAILABLE;
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: typeof c.email === "string" && c.email ? c.email : null } : null;
}

type ProfileRow = { id: string; email: string | null; full_name: string | null; phone: string | null; role: Profile["role"] };

/** The signed-in user and profile. Cached per request, so the layout and page share one lookup. */
export const getSession = cache(async (): Promise<Session | null> => (await sessionState()).session);

/** The session lookup, plus whether it failed because Supabase Auth couldn't be reached. */
const sessionState = cache(async (): Promise<{ session: Session | null; unavailable: boolean }> => {
  const u = await resolveUserId();
  if (u === UNAVAILABLE) return { session: null, unavailable: true };
  return { session: await loadSession(u), unavailable: false };
});

async function loadSession(u: { id: string; email: string | null } | null): Promise<Session | null> {
  if (!u) return null;
  let row = await queryOne<ProfileRow>("select id, email, full_name, phone, role from profiles where id = $1", [u.id]);
  if (!row && env.auth.mode === "supabase") {
    // Only for a login that still exists: a token of a just-deleted account (still valid on another
    // device for up to an hour) is simply signed out, instead of a foreign-key error on every request.
    row = await queryOne<ProfileRow>(
      `insert into profiles (id, email) select $1, $2 where exists (select 1 from auth.users where id = $1)
       on conflict (id) do update set email = excluded.email returning id, email, full_name, phone, role`,
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
