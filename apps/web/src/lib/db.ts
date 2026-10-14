import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { env } from "./env";

declare global {
  var __fbPool: Pool | undefined;
}

function stripSslParams(raw: string) {
  const [base, query = ""] = raw.split("?");
  const kept = query.split("&").filter((kv) => kv && !/^(sslmode|supa)=/.test(kv));
  return kept.length ? `${base}?${kept.join("&")}` : base!;
}

function createPool() {
  const raw = env.databaseUrl;
  const needsSsl = /supabase\.(co|com)|sslmode=require/.test(raw);
  // Drop sslmode/supa query params: node-postgres would treat sslmode=require as full
  // certificate verification and override the ssl option below.
  const url = needsSsl ? stripSslParams(raw) : raw;
  const p = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    // Serverless: the function can be frozen between requests and Supabase drops idle
    // connections, so don't keep idle clients long, fail fast and keep sockets alive.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // An idle client whose socket was closed by the server emits 'error' on the pool; without
  // a listener that would crash the whole process. The client is discarded automatically.
  p.on("error", (e) => console.error("[db] idle client error (discarded):", e.message));
  return p;
}

export const pool: Pool = globalThis.__fbPool ?? createPool();
if (!env.isProd) globalThis.__fbPool = pool;
// On Vercel, release idle clients before the function is suspended (no-op elsewhere).
if (process.env.VERCEL) attachDatabasePool(pool);

/** Errors that mean the connection itself broke (not a problem with the SQL or the data). */
export function isConnectionError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "57P01", "57P02", "57P03", "08000", "08003", "08006", "08001", "08004"].includes(err.code)) return true;
  return /Connection terminated|connection timeout|Client has encountered a connection error|timeout exceeded when trying to connect|server closed the connection/i.test(err.message ?? "");
}

const READ_ONLY = /^\s*(select|with\s[\s\S]*?\)\s*select)\b/i;

/**
 * Runs one statement. A read (SELECT) that fails because the connection dropped — e.g. a stale
 * socket after the serverless function was frozen — is retried once on a fresh connection.
 * Writes are never retried automatically, so nothing can be applied twice.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  try {
    return (await pool.query<T>(text, params)).rows;
  } catch (e) {
    if (!isConnectionError(e) || !READ_ONLY.test(text)) throw e;
    console.warn("[db] connection dropped during a read; retrying once:", (e as Error).message);
    return (await pool.query<T>(text, params)).rows;
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run fn in a transaction as the database owner (privileged server operations). */
/** A client with an open transaction; a dead connection at this point (nothing ran yet) is replaced once. */
async function begin(): Promise<PoolClient> {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      return client;
    } catch (e) {
      client.release(true);
      if (attempt > 0 || !isConnectionError(e)) throw e;
    }
  }
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await begin();
  try {
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
