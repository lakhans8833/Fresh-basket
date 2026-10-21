/**
 * The session check's three outcomes, as callers see them: a 5xx / network failure must come back as
 * "error" (session kept), never as "signed out" / "no access". Uses the real api() client with fetch mocked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client/api";

// Same mapping session-context's refresh() uses (kept in one place there; mirrored here on purpose).
async function check() {
  try {
    const { profile } = await api<{ profile: { role: string } | null }>("/api/me", { cache: "no-store" });
    return profile ? { status: "signed_in" as const, profile } : { status: "signed_out" as const };
  } catch {
    return { status: "error" as const };
  }
}

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));

afterEach(() => vi.unstubAllGlobals());

describe("session check outcomes", () => {
  it("staff profile → signed_in with role", async () => {
    respond(200, { profile: { role: "staff" } });
    expect(await check()).toEqual({ status: "signed_in", profile: { role: "staff" } });
  });
  it("no session → signed_out", async () => {
    respond(200, { profile: null });
    expect(await check()).toEqual({ status: "signed_out" });
  });
  it("server error / unavailable → error (not signed out, not 'no access')", async () => {
    respond(503, { error: "Service unavailable" });
    expect((await check()).status).toBe("error");
    respond(500, { error: "Something went wrong" });
    expect((await check()).status).toBe("error");
  });
  it("network failure → error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect((await check()).status).toBe("error");
  });
});
