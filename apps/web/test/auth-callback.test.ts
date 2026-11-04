/** Email-link landing (/auth/callback): token_hash links, PKCE code links and Supabase error redirects. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_SECRET = "test-secret-test-secret-test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
});

const sb = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ supabaseServerClient: async () => ({ auth: sb }) }));

import { GET, POST } from "@/app/auth/callback/route";
import { RECOVERY_COOKIE, recoveryToken } from "@/lib/tokens";

const B = "00000000-0000-4000-8000-00000000000b";
const ok = (id = B) => ({ data: { user: { id } }, error: null });
/** The browser's path for an email link: token_hash links show a confirm page, and its form POSTs back. */
const post = (fields: Record<string, string>, headers: Record<string, string> = { origin: "https://shop.example" }) =>
  POST(new Request("https://shop.example/auth/callback", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields).toString(),
  }));
const raw = async (qs: string) => {
  const sp = new URLSearchParams(qs);
  if (!sp.has("token_hash") || sp.has("error") || sp.has("error_code")) return GET(new Request(`https://shop.example/auth/callback?${qs}`));
  const page = await GET(new Request(`https://shop.example/auth/callback?${qs}`));
  expect(page.status).toBe(200); // the confirm page, nothing verified yet
  const html = await page.text();
  const fields = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1]!, m[2]!.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'")]));
  return post(fields);
};

const call = async (qs: string) => {
  const res = await raw(qs);
  return new URL(res.headers.get("location")!);
};

beforeEach(() => {
  sb.verifyOtp.mockReset();
  sb.exchangeCodeForSession.mockReset();
});

describe("/auth/callback", () => {
  it("a password-reset token_hash link signs in on any device and opens the reset page", async () => {
    sb.verifyOtp.mockResolvedValue(ok());
    const to = await call("token_hash=abc123&type=recovery");
    expect(sb.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" });
    expect(to.pathname).toBe("/reset-password");
  });

  it("an expired / already used link explains itself on the sign-in page", async () => {
    sb.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", message: "Email link is invalid or has expired" } });
    const to = await call("token_hash=old&type=magiclink&next=%2Fcheckout");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("expired");
    expect(to.searchParams.get("next")).toBe("/checkout");
  });

  it("Supabase's own error redirect (error_code=otp_expired) goes to the sign-in page", async () => {
    const to = await call("error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("expired");
    expect(sb.verifyOtp).not.toHaveBeenCalled();
  });

  it("a PKCE code link still works in the same browser, and explains a different browser", async () => {
    sb.exchangeCodeForSession.mockResolvedValueOnce(ok());
    expect((await call("code=xyz&next=%2Faccount%2Forders")).pathname).toBe("/account/orders");
    sb.exchangeCodeForSession.mockResolvedValueOnce({ error: { code: "bad_code_verifier", message: "invalid flow state, no valid flow state found / code verifier" } });
    const to = await call("code=xyz");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("device");
  });

  it("never redirects off-site, whatever next= says", async () => {
    sb.verifyOtp.mockResolvedValue(ok());
    const to = await call("token_hash=a&type=email&next=%2F.%2F%2Fevil.com");
    expect(to.origin).toBe("https://shop.example");
  });

  it("a successful RECOVERY link marks this browser + that user as recovering (httpOnly cookie)", async () => {
    sb.verifyOtp.mockResolvedValue(ok(B));
    const res = await raw("token_hash=t&type=recovery");
    const cookie = res.cookies.get(RECOVERY_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(recoveryToken.verify(B, cookie?.value)).toBe(true);
    expect(recoveryToken.verify("someone-else", cookie?.value)).toBe(false);
  });

  it("someone's own magic/sign-up link with next=/reset-password does NOT set the recovery mark (login CSRF)", async () => {
    sb.verifyOtp.mockResolvedValue(ok(B));
    for (const type of ["magiclink", "signup", "email"]) {
      const res = await raw(`token_hash=t&type=${type}&next=%2Freset-password`);
      expect(res.cookies.get(RECOVERY_COOKIE)?.value ?? "").toBe("");
    }
    // A PKCE code link (no type, only usable in the browser that asked for it) sent to the reset page still counts.
    sb.exchangeCodeForSession.mockResolvedValueOnce(ok(B));
    const pkce = await raw("code=xyz&next=%2Freset-password");
    expect(recoveryToken.verify(B, pkce.cookies.get(RECOVERY_COOKIE)?.value)).toBe(true);
  });

  it("a failed recovery link or a non-recovery link never sets the recovery mark", async () => {
    sb.verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", message: "expired" } });
    expect((await raw("token_hash=t&type=recovery")).cookies.get(RECOVERY_COOKIE)).toBeUndefined();
    sb.verifyOtp.mockResolvedValue(ok(B));
    expect((await raw("token_hash=t&type=magiclink")).cookies.get(RECOVERY_COOKIE)).toBeUndefined();
    expect((await raw("error_code=otp_expired&next=%2Freset-password")).cookies.get(RECOVERY_COOKIE)).toBeUndefined();
  });

  it("error redirects keep a validated next and never carry tokens", async () => {
    sb.verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", message: "expired" } });
    const to = await call("token_hash=SECRET123&type=recovery&next=%2Freset-password%3Fnext%3D%252Fadmin%252Flogin");
    expect(to.searchParams.get("next")).toBe("/reset-password?next=%2Fadmin%2Flogin");
    expect(to.toString()).not.toMatch(/SECRET123|token_hash|code=/);
  });

  it("S-21: a token_hash link does NOT sign in on GET — it shows a confirm page whose form POSTs back", async () => {
    sb.verifyOtp.mockResolvedValue(ok(B));
    const res = await GET(new Request("https://shop.example/auth/callback?token_hash=t%22x&type=magiclink&next=%2Fcheckout"));
    expect(res.status).toBe(200);
    expect(sb.verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("referrer-policy")).toBe("same-origin"); // the token never leaves the site; Origin stays set
    const html = await res.text();
    expect(html).toMatch(/<form method="post" action="\/auth\/callback">/);
    expect(html).toContain('name="token_hash" value="t&quot;x"'); // escaped
    expect(html).toContain('name="next" value="/checkout"');
    expect(html).toMatch(/noindex/);
  });

  it("S-21: the POST signs in only from this site (cross-site or Origin-less form posts are refused)", async () => {
    sb.verifyOtp.mockResolvedValue(ok(B));
    const fields = { token_hash: "t", type: "magiclink", next: "/checkout" };
    expect((await post(fields, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(fields, {})).status).toBe(403);
    expect((await post(fields, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(sb.verifyOtp).not.toHaveBeenCalled();
    const okRes = await post(fields);
    expect(okRes.status).toBe(303); // the browser follows with a GET
    expect(new URL(okRes.headers.get("location")!).pathname).toBe("/checkout");
    expect(sb.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "t" });
    // Same-origin without an Origin header but with Sec-Fetch-Site: same-origin is fine too.
    expect((await post(fields, { "sec-fetch-site": "same-origin" })).status).toBe(303);
    expect((await post(fields, { origin: "null", "sec-fetch-site": "same-origin" })).status).toBe(303);
    expect((await post(fields, { origin: "null", "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it("S-21: a POST with a bad type or no token goes to the sign-in page without verifying", async () => {
    const r = await post({ token_hash: "t", type: "bogus" });
    expect(new URL(r.headers.get("location")!).pathname).toBe("/login");
    expect((await post({ type: "magiclink" })).headers.get("location")).toMatch(/\/login\?error=link/);
    expect(sb.verifyOtp).not.toHaveBeenCalled();
  });
});
