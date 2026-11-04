/**
 * FB-05 (optional Cloudflare Turnstile on the email-code form). Only when TURNSTILE_SITE_KEY and
 * TURNSTILE_SECRET_KEY are both set; otherwise the route behaves exactly as before.
 * Cloudflare's siteverify and the email sender are mocked; rate limits use the test database.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const mail = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/auth-email", () => ({ sendAuthEmail: async () => { mail.calls++; } }));
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), emailCodesBySmtp: () => true }));

const cf = vi.hoisted(() => ({ calls: [] as URLSearchParams[], reply: { success: true } as unknown, status: 200, down: false }));
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://challenges.cloudflare.com/")) return realFetch(input, init);
  if (cf.down) throw new TypeError("fetch failed");
  cf.calls.push(new URLSearchParams(String(init?.body)));
  return new Response(JSON.stringify(cf.reply), { status: cf.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

import { POST } from "@/app/api/auth/email/route";
import { query } from "@/lib/db";

const send = async (extra: Record<string, unknown> = {}, headers: Record<string, string> = { origin: "http://localhost", "sec-fetch-site": "same-origin" }) => {
  await query("delete from rate_limits");
  const res = await POST(new Request("http://localhost/api/auth/email", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    body: JSON.stringify({ action: "signin", email: `t-${randomUUID().slice(0, 8)}@test.local`, ...extra }),
  }), {} as never);
  return { status: res.status, body: (await res.json()) as { code?: string; sent?: boolean } };
};

afterEach(() => {
  vi.unstubAllEnvs();
  cf.calls = []; cf.reply = { success: true }; cf.status = 200; cf.down = false; mail.calls = 0;
});

describe("FB-05 Turnstile on /api/auth/email", () => {
  it("keys not set → exactly as before: no token needed, Cloudflare never called", async () => {
    expect((await send()).status).toBe(200);
    expect(mail.calls).toBe(1);
    expect(cf.calls).toHaveLength(0);
  });

  it("keys set → a browser request without a token is refused and no email is sent", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    const r = await send();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("CAPTCHA_REQUIRED");
    expect(mail.calls).toBe(0);
  });

  it("keys set → Cloudflare says no → refused; says yes → sent (secret + token + IP sent to siteverify)", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    cf.reply = { success: false, "error-codes": ["invalid-input-response"] };
    const bad = await send({ turnstileToken: "bad-token" });
    expect([bad.status, bad.body.code]).toEqual([400, "CAPTCHA_FAILED"]);
    expect(mail.calls).toBe(0);
    cf.reply = { success: true };
    expect((await send({ turnstileToken: "good-token" })).status).toBe(200);
    expect(mail.calls).toBe(1);
    const last = cf.calls.at(-1)!;
    expect([last.get("secret"), last.get("response"), last.get("remoteip")]).toEqual(["secret-x", "good-token", "203.0.113.9"]);
  });

  it("keys set → the phone app (no browser headers) keeps working without a token", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    expect((await send({}, {})).status).toBe(200);
    expect(cf.calls).toHaveLength(0);
  });

  it("keys set → Cloudflare unreachable: fails open (rate limits still apply), never blocks sign-in", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-x");
    cf.down = true;
    expect((await send({ turnstileToken: "tok" })).status).toBe(200);
    cf.down = false;
    cf.status = 503;
    expect((await send({ turnstileToken: "tok" })).status).toBe(200);
  });

  it("only one key set → off", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    expect((await send()).status).toBe(200);
  });
});
