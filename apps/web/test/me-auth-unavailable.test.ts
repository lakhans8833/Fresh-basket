/**
 * /api/me must tell "couldn't check the session" (Supabase Auth unreachable / failing) apart from
 * "signed out": the first is a 503 (the browser keeps the session and offers a retry), the second a
 * 200 with profile null. Supabase and Next's request headers are mocked here; no network is used.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
});

const h = vi.hoisted(() => ({ headers: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => h.headers.get(k) ?? null }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));
const claims = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: async () => claims.result, getUser: async () => claims.result } }),
}));

import { GET } from "@/app/api/me/route";

const call = async () => {
  const res = await GET(new Request("https://shop.example/api/me"), { params: Promise.resolve({}) } as never);
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  h.headers.clear();
  claims.result = { data: null, error: null };
});

describe("/api/me: outage is not 'signed out'", () => {
  it("no session cookie at all → 200, signed out", async () => {
    expect(await call()).toEqual({ status: 200, body: { profile: null } });
  });
  it("the proxy couldn't reach Supabase to refresh the session → 503 (retry, keep the session)", async () => {
    h.headers.set("x-fb-auth-unavailable", "1");
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("AUTH_UNAVAILABLE");
  });
  it("verifying the access token failed with a network error → 503", async () => {
    h.headers.set("x-fb-sb-access-token", "token");
    claims.result = { data: null, error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" } };
    expect((await call()).status).toBe(503);
  });
  it("an invalid / expired token (a real 'no session') → 200 signed out", async () => {
    h.headers.set("x-fb-sb-access-token", "token");
    claims.result = { data: null, error: { name: "AuthInvalidJwtError", status: 401, message: "invalid JWT" } };
    expect(await call()).toEqual({ status: 200, body: { profile: null } });
  });
});
