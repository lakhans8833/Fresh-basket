import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  var __fbPool: Pool | undefined;
}

function createPool() {
  const url = env.databaseUrl;
  const needsSsl = /supabase\.(co|com)|sslmode=require/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool: Pool = globalThis.__fbPool ?? createPool();
if (!env.isProd) globalThis.__fbPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run fn in a transaction as the database owner (privileged server operations). */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Run fn as the given customer with row-level security enforced, exactly as a
 * request through Supabase's REST API would be (role `authenticated`, auth.uid() = userId).
 */
export async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return tx(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await c.query("set local role authenticated");
    return fn(c);
  });
}
