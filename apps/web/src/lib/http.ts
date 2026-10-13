import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

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
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
      }
      const pgCode = (e as { code?: string })?.code;
      if (pgCode === "42501") {
        return NextResponse.json({ error: "You don't have access to this.", code: "FORBIDDEN" }, { status: 403 });
      }
      if (pgCode === "23505") {
        return NextResponse.json({ error: "That already exists.", code: "DUPLICATE" }, { status: 409 });
      }
      console.error("[api]", req.method, new URL(req.url).pathname, e);
      return NextResponse.json({ error: "Something went wrong. Please try again.", code: "INTERNAL" }, { status: 500 });
    }
  };
}

/** Very small in-memory rate limiter (per server instance). Use a shared store in production at scale. */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  b.n += 1;
  if (b.n > limit) throw new HttpError(429, "Too many requests. Please wait a moment.", "RATE_LIMITED");
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
