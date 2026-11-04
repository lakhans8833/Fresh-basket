import "server-only";
import { query } from "./db";
import { getSession } from "./auth";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Admin API requests that change something (and are worth recording). */
export function isAuditedAdminRequest(req: Request): boolean {
  return MUTATING.has(req.method) && new URL(req.url).pathname.startsWith("/api/admin/");
}

/**
 * Records an admin action in public.admin_audit_log: who (user id + role), what (method + path, which
 * holds the record id) and the result (HTTP status). Request bodies are never stored, so passwords,
 * sign-in codes, tokens and payment details can't end up in the log. Requests with no signed-in user
 * (anonymous probes → 401) aren't recorded, so the table can't be filled from outside. Best effort:
 * a logging failure never changes the response.
 */
export async function recordAdminAction(req: Request, status: number): Promise<void> {
  try {
    const session = await getSession().catch(() => null);
    if (!session) return;
    const path = new URL(req.url).pathname.slice(0, 300);
    await query("insert into admin_audit_log (actor_id, actor_role, method, path, status) values ($1, $2, $3, $4, $5)", [
      session.userId,
      session.profile.role,
      req.method,
      path,
      status,
    ]);
  } catch (e) {
    console.error("[admin-audit] could not record", req.method, new URL(req.url).pathname, e instanceof Error ? e.message : e);
  }
}
