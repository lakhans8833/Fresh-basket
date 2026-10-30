/**
 * The rate limiter keeps its counters in Postgres (public.rate_limits), so a limit holds across server
 * instances (on Vercel each instance has its own memory). A fresh module import stands in for a new instance.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { pool, queryOne } from "@/lib/db";

async function freshInstance() {
  vi.resetModules();
  return import("@/lib/http");
}

afterAll(async () => {
  await pool.query("delete from public.rate_limits");
});

describe("shared rate limit", () => {
  it("counts hits across instances and refuses the one over the limit", async () => {
    const key = `test:${randomUUID()}`;
    const a = await freshInstance();
    await a.rateLimit(key, 3, 60_000);
    await a.rateLimit(key, 3, 60_000);
    const b = await freshInstance(); // empty memory, like another server
    await b.rateLimit(key, 3, 60_000);
    await expect(b.rateLimit(key, 3, 60_000)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    const c = await freshInstance();
    await expect(c.rateLimit(key, 3, 60_000)).rejects.toMatchObject({ status: 429 });
  });

  it("stores only a hash of the key (keys can contain a phone number)", async () => {
    const key = `wa-order-phone:98${Date.now().toString().slice(-8)}`;
    const { rateLimit } = await freshInstance();
    await rateLimit(key, 5, 60_000);
    const hash = createHash("sha256").update(key).digest("hex");
    expect(await queryOne("select 1 from public.rate_limits where key_hash = $1", [hash])).not.toBeNull();
    expect(await queryOne("select 1 from public.rate_limits where key_hash = $1", [key])).toBeNull();
  });

  it("starts a new window once the old one has ended", async () => {
    const key = `test:${randomUUID()}`;
    const a = await freshInstance();
    await a.rateLimit(key, 1, 60_000);
    await expect(a.rateLimit(key, 1, 60_000)).rejects.toMatchObject({ status: 429 });
    const hash = createHash("sha256").update(key).digest("hex");
    await pool.query("update public.rate_limits set reset_at = now() - interval '1 second' where key_hash = $1", [hash]);
    const b = await freshInstance();
    await expect(b.rateLimit(key, 1, 60_000)).resolves.toBe(1); // first hit of the new window
  });

  it("is not reachable through the public API roles", async () => {
    const r = await queryOne<{ anon: boolean; authed: boolean; rls: boolean }>(
      `select has_table_privilege('anon', 'public.rate_limits', 'select') as anon,
              has_table_privilege('authenticated', 'public.rate_limits', 'select') as authed,
              (select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass) as rls`,
    );
    expect(r).toEqual({ anon: false, authed: false, rls: true });
  });
});
