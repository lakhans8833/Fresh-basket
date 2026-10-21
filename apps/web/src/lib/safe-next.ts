/**
 * Validates a "?next=" return path so sign-in and email links can only send people to pages on this
 * site. Rejects absolute URLs, protocol-relative "//evil.com", backslash tricks ("/\\evil.com",
 * which browsers treat as "//evil.com") and control characters.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "https://same-origin.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    // Dot segments ("/.//evil.com", "/x/..//evil.com") collapse to "//evil.com" when parsed, which a
    // browser treats as another site: check the result again.
    if (u.pathname.startsWith("//") || u.pathname.startsWith("/\\")) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
