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

/**
 * TLS for the database. With DATABASE_CA_CERT (the PEM of Supabase's CA, from Supabase → Database →
 * SSL configuration; "\n" escapes allowed) the server certificate is VERIFIED. Without it, the
 * connection is still encrypted but not verified (the previous behaviour) — set the CA to close that.
 */
export function databaseSsl(): { rejectUnauthorized: boolean; ca?: string } {
  const ca = process.env.DATABASE_CA_CERT?.trim().replace(/\\n/g, "\n");
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false };
}

function createPool() {
  const raw = env.databaseUrl;
  const needsSsl = /supabase\.(co|com)|sslmode=require/.test(raw);
  // Drop sslmode/supa query params: node-postgres would treat sslmode=require as full
  // certificate verification and override the ssl option below.
  const url = needsSsl ? stripSslParams(raw) : raw;
  const p = new Pool({
    connectionString: url,
    // Small on purpose: every serverless instance has its own pool, and Supabase's pooler allows 200
    // client connections in all (free plan). 3 per instance leaves room for a burst of instances.
    max: Number(process.env.DB_POOL_MAX ?? 3),
    ssl: needsSsl ? databaseSsl() : undefined,
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
  return isPoolFull(e) || /Connection terminated|connection timeout|Client has encountered a connection error|timeout exceeded when trying to connect|server closed the connection/i.test(err.message ?? "");
}

/** The database's connection pooler is momentarily full (Supabase: "EMAXCONN max client connections reached"). */
export function isPoolFull(e: unknown): boolean {
  return /EMAXCONN|max client connections reached|too many clients already|remaining connection slots are reserved/i.test((e as { message?: string } | null)?.message ?? "");
}

/** A short random pause before retrying, so a burst of requests doesn't retry in lockstep. */
const backoff = () => new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));

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
    if (isPoolFull(e)) await backoff();
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
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (e) {
      // Nothing has run yet, so connecting again is always safe.
      if (attempt > 0 || !isConnectionError(e)) throw e;
      if (isPoolFull(e)) await backoff();
      continue;
    }
    try {
      await client.query("begin");
      return client;
    } catch (e) {
      client.release(true);
      if (attempt > 0 || !isConnectionError(e)) throw e;
      if (isPoolFull(e)) await backoff();
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

/** Reasons recorded in public.stock_movements (see migration 20261104000001). */
export type StockReason =
  | "order_placed" | "order_cancelled" | "hold_expired" | "late_payment" | "order_adjustment" | "admin_edit" | "payment_start_failed";

/**
 * Label the stock changes made in this transaction for the stock movement history. Transaction-local
 * (set_config(..., true)), so it can't leak to another request sharing the pooled connection.
 * Must be called inside tx()/asUser(). Changes made without a label are still recorded ("unlabelled").
 */
export async function labelStockChange(c: PoolClient, reason: StockReason, ids: { orderId?: string | null; actorId?: string | null } = {}) {
  await c.query("select set_config('fb.stock_reason', $1, true), set_config('fb.order_id', $2, true), set_config('fb.actor', $3, true)", [
    reason,
    ids.orderId ?? "",
    ids.actorId ?? "",
  ]);
}
