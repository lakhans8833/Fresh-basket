/**
 * Sign-in / sign-up emails sent by the store over SMTP (instead of Supabase's 2-an-hour mailer).
 * Supabase's admin generateLink and the SMTP sender are mocked; rate limits use the test database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => ({ calls: [] as unknown[], updates: [] as { id: string; attrs: { password?: string } }[], result: null as unknown }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        generateLink: async (p: unknown) => {
          gen.calls.push(p);
          return gen.result;
        },
        updateUserById: async (id: string, attrs: { password?: string }) => {
          gen.updates.push({ id, attrs });
          return { data: {}, error: null };
        },
      },
    },
  }),
}));
const sent = vi.hoisted(() => ({ mails: [] as { to: string; subject: string; text: string; html: string }[] }));
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { to: string; subject: string; text: string; html: string }) => { sent.mails.push(m); } }));

const SMTP_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  APP_SECRET: "test-secret-test-secret-test-secret-123",
  NEXT_PUBLIC_APP_URL: "https://shop.example",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "store@example.com",
  SMTP_PASS: "app-password",
};

async function load(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  const db = await import("@/lib/db");
  await db.query("delete from public.rate_limits");
  const route = await import("@/app/api/auth/email/route");
  const config = await import("@/app/api/auth/config/route");
  const post = async (body: unknown, ip = "203.0.113.7") => {
    const res = await route.POST(new Request("https://shop.example/api/auth/email", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({}) } as never);
    return { status: res.status, body: await res.json() };
  };
  const cfg = async () => (await (await config.GET(new Request("https://shop.example/api/auth/config"), { params: Promise.resolve({}) } as never)).json()) as { emailCodes: string };
  return { post, cfg, db };
}

beforeEach(() => {
  gen.calls = [];
  gen.updates = [];
  gen.result = { data: { properties: { email_otp: "482913", hashed_token: "hash-abc", verification_type: "magiclink" }, user: { id: "u-confirmed", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null };
  sent.mails = [];
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("without SMTP", () => {
  it("config says Supabase sends the codes, and the endpoint is off", async () => {
    const { post, cfg } = await load({ ...SMTP_ENV, SMTP_HOST: "" });
    expect((await cfg()).emailCodes).toBe("supabase");
    expect((await post({ action: "signin", email: "a@example.com" })).status).toBe(404);
    expect(sent.mails).toHaveLength(0);
  });
});

describe("with SMTP", () => {
  it("config says the store sends the codes", async () => {
    const { cfg } = await load(SMTP_ENV);
    expect((await cfg()).emailCodes).toBe("app");
  });

  it("sign-in: Supabase generates a code (no Supabase email) and the store emails it", async () => {
    const { post } = await load(SMTP_ENV);
    const r = await post({ action: "signin", email: "  New@Example.com ", name: "Asha <b>" });
    expect(r).toEqual({ status: 200, body: { sent: true } });
    expect(gen.calls).toEqual([{ type: "magiclink", email: "new@example.com", options: { data: { full_name: "Asha <b>" } } }]);
    expect(sent.mails).toHaveLength(1);
    expect(sent.mails[0]!.to).toBe("new@example.com");
    expect(sent.mails[0]!.subject).toContain("482913");
    expect(sent.mails[0]!.text).toContain("482913");
    expect(sent.mails[0]!.html).not.toContain("<b>"); // nothing from the request is put into the HTML unescaped
  });

  it("sign-up: creates the account with the password and emails the confirmation code", async () => {
    const { post } = await load(SMTP_ENV);
    expect((await post({ action: "signup", email: "b@example.com", password: "short" })).status).toBe(400); // < 8 characters
    const r = await post({ action: "signup", email: "b@example.com", password: "long-enough-1", name: "B" });
    expect(r.status).toBe(200);
    expect(gen.calls.at(-1)).toEqual({ type: "signup", email: "b@example.com", password: "long-enough-1", options: { data: { full_name: "B" } } });
    expect(sent.mails.at(-1)!.text).toContain("482913");
  });

  it("sign-up for an email that already has an account → 409, no email", async () => {
    const { post } = await load(SMTP_ENV);
    gen.result = { data: { properties: null }, error: { code: "email_exists", message: "A user with this email address has already been registered", status: 422 } };
    const r = await post({ action: "signup", email: "c@example.com", password: "long-enough-1" });
    expect(r.status).toBe(409);
    expect(sent.mails).toHaveLength(0);
  });

  it("password reset: a one-time link to /auth/callback (token_hash) on the store's own address", async () => {
    const { post } = await load(SMTP_ENV);
    gen.result = { data: { properties: { email_otp: "111111", hashed_token: "hash-xyz", verification_type: "recovery" } }, error: null };
    expect((await post({ action: "recovery", email: "d@example.com" })).status).toBe(200);
    expect(gen.calls.at(-1)).toEqual({ type: "recovery", email: "d@example.com" });
    expect(sent.mails.at(-1)!.text).toContain("https://shop.example/auth/callback?token_hash=hash-xyz&type=recovery&next=%2Freset-password");
  });

  it("password reset for an unknown email: same answer, no email (nobody can probe accounts)", async () => {
    const { post } = await load(SMTP_ENV);
    gen.result = { data: { properties: null }, error: { code: "user_not_found", message: "User with this email not found", status: 404 } };
    expect(await post({ action: "recovery", email: "nobody@example.com" })).toEqual({ status: 200, body: { sent: true } });
    expect(sent.mails).toHaveLength(0);
  });

  it("one email per address per 45 s from a network; Gmail dots/+tags are the same address; a bad address is a 400", async () => {
    const { post } = await load(SMTP_ENV);
    expect((await post({ action: "signin", email: "e.f@gmail.com" })).status).toBe(200);
    expect((await post({ action: "signin", email: "ef+x@gmail.com" })).status).toBe(429);
    expect((await post({ action: "signin", email: "not-an-email" })).status).toBe(400);
    expect(sent.mails).toHaveLength(1);
  });

  it("someone hammering an address from another network can't use up its owner's allowance", async () => {
    const { post } = await load(SMTP_ENV);
    // Attacker sends from several networks; each network is held to 1 per 45 s for this address.
    for (let i = 0; i < 5; i++) {
      expect((await post({ action: "signin", email: "victim@example.com" }, `198.51.100.${i + 1}`)).status).toBe(200);
      expect((await post({ action: "signin", email: "victim@example.com" }, `198.51.100.${i + 1}`)).status).toBe(429);
    }
    // The victim, on their own network, still gets a code.
    expect((await post({ action: "signin", email: "victim@example.com" }, "203.0.113.200")).status).toBe(200);
  });

  it("an address's hourly limit used up from elsewhere doesn't lock its owner out (2 an hour per network still go through)", async () => {
    const { post } = await load(SMTP_ENV);
    // 15 requests for the address from 15 different networks use up its hourly allowance…
    for (let i = 0; i < 15; i++) expect((await post({ action: "signin", email: "owner@example.com" }, `198.51.100.${i + 10}`)).status).toBe(200);
    // …a 16th network (someone else) is refused, but the owner's own network still gets codes.
    expect((await post({ action: "signin", email: "owner@example.com" }, "198.51.100.99")).status).toBe(200); // its first: allowed
    expect((await post({ action: "signin", email: "owner@example.com" }, "2001:db8:aa:1::1")).status).toBe(200);
    // The same /48 again from another /64 (past the 45 s per-network wait): its 2nd is allowed, its 3rd isn't.
    expect((await post({ action: "signin", email: "owner@example.com" }, "2001:db8:aa:2::1")).status).toBe(200);
    expect((await post({ action: "signin", email: "owner@example.com" }, "2001:db8:aa:3::1")).status).toBe(429);
  });

  it("IPv6 addresses in one /64 count as one network", async () => {
    const { post } = await load(SMTP_ENV);
    expect((await post({ action: "signin", email: "g@example.com" }, "2001:db8:1:2::1")).status).toBe(200);
    expect((await post({ action: "signin", email: "g@example.com" }, "2001:db8:1:2:ffff::9")).status).toBe(429);
    expect((await post({ action: "signin", email: "g@example.com" }, "2001:db8:1:3::1")).status).toBe(200);
  });

  it("code sign-in to a never-confirmed account replaces the password someone else may have set", async () => {
    const { post } = await load(SMTP_ENV);
    gen.result = { data: { properties: { email_otp: "555111", hashed_token: "h", verification_type: "magiclink" }, user: { id: "u-unconfirmed", email_confirmed_at: null } }, error: null };
    expect((await post({ action: "signin", email: "h@example.com" })).status).toBe(200);
    expect(gen.updates).toHaveLength(1);
    expect(gen.updates[0]!.id).toBe("u-unconfirmed");
    expect(gen.updates[0]!.attrs.password!.length).toBeGreaterThanOrEqual(30);
    // A confirmed account keeps its password.
    gen.result = { data: { properties: { email_otp: "555222", hashed_token: "h", verification_type: "magiclink" }, user: { id: "u-confirmed", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null };
    expect((await post({ action: "signin", email: "i@example.com" })).status).toBe(200);
    expect(gen.updates).toHaveLength(1);
  });

  it("the same network can't spray codes to many addresses", async () => {
    const { post } = await load(SMTP_ENV);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post({ action: "signin", email: `x${i}@example.com` }, "192.0.2.50")).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});
