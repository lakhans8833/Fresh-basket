/**
 * One public address for the shop. A production deployment can be reached under several hosts: the
 * project's *.vercel.app names, the per-deployment URL, and (when attached) the custom domain. Search
 * engines index every one of them as a separate copy of the site, and sign-in links / cookies get
 * split between them. On production, page requests that arrive under any host other than
 * NEXT_PUBLIC_APP_URL's are permanently redirected there (same path and query).
 *
 * Not redirected: API calls (a 308 on a POST from an old app build or a webhook could fail), and
 * /auth/* (an email link's PKCE verifier cookie lives on the host that started the sign-in).
 * Preview deployments are never redirected, and nothing happens when NEXT_PUBLIC_APP_URL isn't set.
 */
export function canonicalRedirect(
  url: URL,
  host: string | null,
  method: string,
  appUrl: string | undefined,
  vercelEnv: string | undefined,
): URL | null {
  if (vercelEnv !== "production" || !appUrl || !host) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/.well-known/")) return null;
  let want: URL;
  try {
    want = new URL(appUrl);
  } catch {
    return null;
  }
  if (want.protocol !== "https:" || host.toLowerCase() === want.host.toLowerCase()) return null;
  return new URL(url.pathname + url.search, want.origin);
}
