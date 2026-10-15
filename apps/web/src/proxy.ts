import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Internal header carrying the access token the proxy just verified (see lib/auth.ts). */
const ACCESS_HEADER = "x-fb-sb-access-token";
// Server-to-server endpoints authenticated by signature/secret instead of cookies.
const ORIGIN_EXEMPT = ["/api/webhooks/", "/api/cron/"];

function allowedOrigins(req: NextRequest) {
  return new Set([req.nextUrl.origin, ...(process.env.EXTRA_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)]);
}

/** CORS for explicitly allowed extra origins (e.g. Expo web during development). Bearer auth only — no cookies. */
function withCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && allowedOrigins(req).has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.headers.set("Access-Control-Max-Age", "600");
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && req.method === "OPTIONS") {
    return withCors(req, new NextResponse(null, { status: 204 }));
  }

  // CSRF defence for cookie-authenticated API calls: browsers always send Origin on
  // cross-site POSTs; reject any that don't come from this site. Native mobile apps
  // send no Origin and authenticate with a Bearer token instead.
  if (pathname.startsWith("/api/") && MUTATING.has(req.method) && !ORIGIN_EXEMPT.some((p) => pathname.startsWith(p))) {
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigins(req).has(origin)) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  // Supabase Auth: this proxy is the ONLY place that refreshes the session. It runs before every
  // page and API request, refreshes an expired access token once, writes the new cookies to the
  // response, and hands the verified access token to the route via an internal request header.
  // Route handlers / server components only verify that token (no refresh), so parallel requests
  // never spend the same refresh token twice (Supabase revokes the session on refresh-token reuse).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const forwarded = new Headers(req.headers);
  forwarded.delete(ACCESS_HEADER); // never trust a client-supplied value
  if (!url || !key) return withCors(req, NextResponse.next({ request: { headers: forwarded } }));

  const toSet: { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) {
          req.cookies.set(c.name, c.value);
          toSet.push(c);
        }
      },
    },
  });
  // getUser() verifies the JWT with Supabase Auth and refreshes it first if it has expired.
  const { data } = await sb.auth.getUser();
  if (data.user) {
    const { data: s } = await sb.auth.getSession(); // already fresh — no second refresh
    if (s.session?.access_token) forwarded.set(ACCESS_HEADER, s.session.access_token);
  }
  // Cookies changed by the refresh must be visible to the route as well.
  if (toSet.length) forwarded.set("cookie", req.cookies.toString());
  const res = NextResponse.next({ request: { headers: forwarded } });
  for (const c of toSet) res.cookies.set(c.name, c.value, c.options);
  return withCors(req, res);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|images/|icons/|uploads/|favicon.ico|sw.js|offline.html|og-image.jpg|manifest.webmanifest|robots.txt|sitemap.xml).*)"],
};
