/** Email-link landing (/auth/callback): token_hash links, PKCE code links and Supabase error redirects. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
});

const sb = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ supabaseServerClient: async () => ({ auth: sb }) }));

import { GET } from "@/app/auth/callback/route";

const call = async (qs: string) => {
  const res = await GET(new Request(`https://shop.example/auth/callback?${qs}`));
  return new URL(res.headers.get("location")!);
};

beforeEach(() => {
  sb.verifyOtp.mockReset();
  sb.exchangeCodeForSession.mockReset();
});

describe("/auth/callback", () => {
  it("a password-reset token_hash link signs in on any device and opens the reset page", async () => {
    sb.verifyOtp.mockResolvedValue({ error: null });
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
    sb.exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    expect((await call("code=xyz&next=%2Faccount%2Forders")).pathname).toBe("/account/orders");
    sb.exchangeCodeForSession.mockResolvedValueOnce({ error: { code: "bad_code_verifier", message: "invalid flow state, no valid flow state found / code verifier" } });
    const to = await call("code=xyz");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("device");
  });

  it("never redirects off-site, whatever next= says", async () => {
    sb.verifyOtp.mockResolvedValue({ error: null });
    const to = await call("token_hash=a&type=email&next=%2F.%2F%2Fevil.com");
    expect(to.origin).toBe("https://shop.example");
  });
});
