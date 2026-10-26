/**
 * Sign-in / sign-up emails sent by the store over SMTP (instead of Supabase's 2-an-hour mailer).
 * Supabase's admin generateLink and the SMTP sender are mocked; rate limits use the test database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => ({ calls: [] as unknown[], result: null as unknown }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        generateLink: async (p: unknown) => {
          gen.calls.push(p);
          return gen.result;
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
  gen.result = { data: { properties: { email_otp: "482913", hashed_token: "hash-abc", verification_type: "magiclink" } }, error: null };
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

  it("one email per address per 45 s; a bad address is a 400", async () => {
    const { post } = await load(SMTP_ENV);
    expect((await post({ action: "signin", email: "e@example.com" })).status).toBe(200);
    expect((await post({ action: "signin", email: "e@example.com" }, "198.51.100.9")).status).toBe(429);
    expect((await post({ action: "signin", email: "not-an-email" })).status).toBe(400);
    expect(sent.mails).toHaveLength(1);
  });

  it("the same network can't spray codes to many addresses", async () => {
    const { post } = await load(SMTP_ENV);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post({ action: "signin", email: `x${i}@example.com` }, "192.0.2.50")).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});
