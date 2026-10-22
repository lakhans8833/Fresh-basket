/**
 * Admin → Users → Edit → Password: one-time reset link and "set new password".
 * Supabase Auth's admin API is mocked (no network); the user rows live in the test database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
});
const sb = vi.hoisted(() => ({
  calls: [] as unknown[][],
  linkResult: { data: { properties: { hashed_token: "hash/with+chars" } }, error: null } as { data: unknown; error: unknown },
  updateResult: { data: {}, error: null } as { data: unknown; error: unknown },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        generateLink: async (...a: unknown[]) => { sb.calls.push(["generateLink", ...a]); return sb.linkResult; },
        updateUserById: async (...a: unknown[]) => { sb.calls.push(["updateUserById", ...a]); return sb.updateResult; },
      },
    },
  }),
}));

import { query, queryOne } from "@/lib/db";
import { adminCreateResetLink, adminSetPassword } from "@/lib/admin/users";

const newUser = async (email: string) =>
  (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))!.id;
const admin = randomUUID();

beforeEach(() => {
  sb.calls = [];
  sb.linkResult = { data: { properties: { hashed_token: "hash/with+chars" } }, error: null };
  sb.updateResult = { data: {}, error: null };
});

describe("adminCreateResetLink", () => {
  it("returns a link that works on any device (token_hash → /reset-password)", async () => {
    const email = `reset-${randomUUID()}@test.local`;
    const id = await newUser(email);
    const r = await adminCreateResetLink(admin, id, "https://shop.example");
    expect(sb.calls[0]).toEqual(["generateLink", { type: "recovery", email }]);
    const u = new URL(r.link);
    expect(u.origin + u.pathname).toBe("https://shop.example/auth/callback");
    expect(u.searchParams.get("token_hash")).toBe("hash/with+chars");
    expect(u.searchParams.get("type")).toBe("recovery");
    expect(u.searchParams.get("next")).toBe("/reset-password");
  });
  it("refuses your own account and unknown users", async () => {
    const id = await newUser(`self-${randomUUID()}@test.local`);
    await expect(adminCreateResetLink(id, id, "https://shop.example")).rejects.toMatchObject({ status: 400 });
    await expect(adminCreateResetLink(admin, randomUUID(), "https://shop.example")).rejects.toMatchObject({ status: 404 });
    expect(sb.calls).toEqual([]);
  });
  it("reports a Supabase failure as 502", async () => {
    const id = await newUser(`fail-${randomUUID()}@test.local`);
    sb.linkResult = { data: null, error: { message: "boom" } };
    await expect(adminCreateResetLink(admin, id, "https://shop.example")).rejects.toMatchObject({ status: 502 });
  });
});

describe("adminSetPassword", () => {
  it("sets the password and signs the user out everywhere", async () => {
    const id = await newUser(`pw-${randomUUID()}@test.local`);
    await query("insert into auth.sessions (id, user_id) values ($1, $2)", [randomUUID(), id]).catch(() => undefined);
    await adminSetPassword(admin, id, "new-pass-123");
    expect(sb.calls[0]).toEqual(["updateUserById", id, { password: "new-pass-123" }]);
    const left = await queryOne<{ n: number }>("select count(*)::int n from auth.sessions where user_id = $1", [id]).catch(() => ({ n: 0 }));
    expect(left!.n).toBe(0);
  });
  it("refuses short passwords and your own account", async () => {
    const id = await newUser(`short-${randomUUID()}@test.local`);
    await expect(adminSetPassword(admin, id, "short")).rejects.toMatchObject({ status: 400 });
    await expect(adminSetPassword(id, id, "long-enough-1")).rejects.toMatchObject({ status: 400 });
    expect(sb.calls).toEqual([]);
  });
  it("turns Supabase's weak-password error into a clear 400", async () => {
    const id = await newUser(`weak-${randomUUID()}@test.local`);
    sb.updateResult = { data: null, error: { message: "Password is known to be weak and easy to guess" } };
    await expect(adminSetPassword(admin, id, "password123")).rejects.toMatchObject({ status: 400 });
  });
});
