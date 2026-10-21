import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { invalidateAfter } from "./cache";
import { query, queryOne } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, "BAD_REQUEST", details);
export const unauthorized = (m = "Please sign in to continue.") => new HttpError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "You don't have access to this.") => new HttpError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found.") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m: string, details?: unknown, code = "CONFLICT") => new HttpError(409, m, code, details);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be JSON.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(first ? first.message : "Invalid request.", z.flattenError(r.error));
  }
  return r.data;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler: converts thrown HttpErrors to JSON and hides internal errors. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      const res = await fn(req, ctx);
      invalidateAfter(req, res.status);
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
      }
      const pgCode = (e as { code?: string })?.code;
      if (pgCode === "42501") {
        return NextResponse.json({ error: "You don't have access to this.", code: "FORBIDDEN" }, { status: 403 });
      }
      if (pgCode === "22P02") {
        // Malformed id in the URL (e.g. not a UUID): treat as "not found", not a server error.
        return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
      }
      if (pgCode === "23505") {
        return NextResponse.json({ error: "That already exists.", code: "DUPLICATE" }, { status: 409 });
      }
      console.error("[api]", req.method, new URL(req.url).pathname, e);
      return NextResponse.json({ error: "Something went wrong. Please try again.", code: "INTERNAL" }, { status: 500 });
    }
  };
}

/**
 * Rate limiter shared by all server instances (counters in public.rate_limits). Throws 429 when `key`
 * has been used more than `limit` times in the current window. A local in-memory copy answers repeat
 * offenders without a database round trip, and is the fallback if the database can't be reached
 * (a limiter outage must not stop customers from ordering).
 */
const buckets = new Map<string, { n: number; reset: number }>();
const tooMany = () => new HttpError(429, "Too many requests. Please wait a moment.", "RATE_LIMITED");

function memoryHit(key: string, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    const fresh = { n: 1, reset: now + windowMs };
    buckets.set(key, fresh);
    return fresh;
  }
  b.n += 1;
  return b;
}

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const local = memoryHit(key, windowMs);
  if (local.n > limit) throw tooMany();
  try {
    const keyHash = createHash("sha256").update(key).digest("hex");
    const row = await queryOne<{ hits: number; reset_ms: string }>(
      `insert into public.rate_limits (key_hash, hits, reset_at)
       values ($1, 1, now() + $2 * interval '1 millisecond')
       on conflict (key_hash) do update set
         hits = case when rate_limits.reset_at <= now() then 1 else rate_limits.hits + 1 end,
         reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
       returning hits, (extract(epoch from reset_at) * 1000)::bigint::text as reset_ms`,
      [keyHash, windowMs],
    );
    if (row) {
      // Keep the local copy in step, so the next over-limit request is refused without the database.
      local.n = Math.max(local.n, row.hits);
      local.reset = Number(row.reset_ms);
      if (row.hits > limit) throw tooMany();
    }
    // Housekeeping: now and then, drop counters whose window ended a day ago.
    if (Math.random() < 0.01) void query("delete from public.rate_limits where reset_at < now() - interval '1 day'").catch(() => undefined);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.warn("[rate-limit] shared counter unavailable, using this instance's memory only");
  }
}

/**
 * The caller's IP for rate limits. On Vercel, x-real-ip / x-vercel-forwarded-for are set by the platform
 * (a client can't fake them); x-forwarded-for is only a fallback for other hosts and local runs.
 */
export function clientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("x-real-ip")?.trim() ||
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
