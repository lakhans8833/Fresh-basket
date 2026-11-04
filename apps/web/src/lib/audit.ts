import "server-only";
import { query } from "./db";
import type { RequestContext } from "./request-context";

/** Keys whose values never go into the audit log. */
const SECRET_KEY = /pass(word)?|token|otp|secret|signature|authori[sz]ation|api_?key|private/i;
const MAX_STRING = 200;
const MAX_ITEMS = 25;

/** A copy of a request body that is safe and small enough to keep: secrets replaced, long values cut. */
export function sanitize(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
  if (depth >= 4) return "…";
  if (Array.isArray(v)) {
    const out = v.slice(0, MAX_ITEMS).map((x) => sanitize(x, depth + 1));
    if (v.length > MAX_ITEMS) out.push(`… ${v.length - MAX_ITEMS} more`);
    return out;
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 60)) out[k] = SECRET_KEY.test(k) ? "[hidden]" : sanitize(x, depth + 1);
    return out;
  }
  return String(v).slice(0, MAX_STRING);
}

/** Saving admin/staff API calls (not reads) are recorded. */
export function isAuditedRequest(req: Request) {
  return req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && new URL(req.url).pathname.startsWith("/api/admin/");
}

/**
 * Record one admin/staff action. Never throws: a failed log write is reported in the server log but
 * must not turn a successful save into an error for the user.
 */
export async function writeAuditLog(req: Request, bodyCopy: Request | null, status: number, ctx: RequestContext) {
  const actor = ctx.actor;
  if (!actor) return; // not signed in as staff → the call was refused before it changed anything
  try {
    let details: unknown = null;
    const type = req.headers.get("content-type") ?? "";
    if (bodyCopy && type.includes("application/json")) {
      const text = await bodyCopy.text();
      if (text.length <= 64_000) {
        try {
          details = sanitize(JSON.parse(text));
        } catch {
          details = { note: "body was not valid JSON" };
        }
      } else details = { note: `large body (${text.length} bytes) not stored` };
    } else if (type) details = { note: type.split(";")[0] };
    const url = new URL(req.url);
    await query(
      `insert into admin_audit_log (actor_id, actor_email, actor_role, method, path, status, details)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [actor.id, actor.email, actor.role, req.method, url.pathname, status, details === null ? null : JSON.stringify(details)],
    );
  } catch (e) {
    console.error("[audit] could not record admin action:", e instanceof Error ? e.message : e);
  }
}
