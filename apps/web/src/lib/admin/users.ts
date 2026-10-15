import "server-only";
import type { Profile } from "@freshbasket/shared";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";
import { query, queryOne, tx } from "../db";
import { badRequest, conflict, HttpError, notFound } from "../http";

export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Profile["role"];
  createdAt: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  orders: number;
}

/** Customers and staff with their sign-up / email-confirmation status (from Supabase Auth). */
export async function adminListUsers(q?: string | null): Promise<AdminUser[]> {
  const params: unknown[] = [];
  let where = "";
  if (q && q.trim()) {
    params.push(`%${q.trim().toLowerCase().replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    where = `where lower(coalesce(p.email, '')) like $1 or lower(coalesce(p.full_name, '')) like $1 or coalesce(p.phone, '') like $1`;
  }
  const rows = await query<{
    id: string; email: string | null; full_name: string | null; phone: string | null; role: Profile["role"];
    created_at: Date | null; email_confirmed_at: Date | null; last_sign_in_at: Date | null; orders: number;
  }>(
    `select p.id, coalesce(p.email, u.email) as email, p.full_name, p.phone, p.role,
            u.created_at, u.email_confirmed_at, u.last_sign_in_at,
            (select count(*) from orders o where o.user_id = p.id and o.status <> 'cancelled')::int as orders
       from profiles p
       left join auth.users u on u.id = p.id
       ${where}
      order by (p.role = 'admin') desc, (p.role = 'staff') desc, u.created_at desc nulls last
      limit 300`,
    params,
  );
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return rows.map((r) => ({
    id: r.id, email: r.email, fullName: r.full_name, phone: r.phone, role: r.role,
    createdAt: iso(r.created_at), emailConfirmedAt: iso(r.email_confirmed_at), lastSignInAt: iso(r.last_sign_in_at), orders: r.orders,
  }));
}

/** Change a user's role. You can't change your own role, and the store always keeps one admin. */
export async function adminSetRole(actorId: string, userId: string, role: Profile["role"]) {
  if (actorId === userId) throw badRequest("You can't change your own role. Ask another admin.");
  return tx(async (c) => {
    // Lock the admin rows so two admins can't demote each other at the same moment.
    const { rows: admins } = await c.query<{ id: string }>("select id from profiles where role = 'admin' for update");
    const { rows } = await c.query<{ role: Profile["role"] }>("select role from profiles where id = $1 for update", [userId]);
    if (!rows[0]) throw notFound("User not found.");
    if (rows[0].role === "admin" && role !== "admin" && admins.length <= 1) throw conflict("Keep at least one admin.");
    await c.query("update profiles set role = $2 where id = $1", [userId, role]);
    return { id: userId, role };
  });
}

async function authUser(userId: string) {
  const u = await queryOne<{ email: string | null; email_confirmed_at: Date | null }>("select email, email_confirmed_at from auth.users where id = $1", [userId]);
  if (!u) throw notFound("User not found.");
  return u;
}

/**
 * Mark a user's email as confirmed (e.g. they called the store and can't find the email).
 * Uses the Supabase Auth admin API with the server-only service role key; on a local database
 * without Supabase Auth it sets auth.users.email_confirmed_at directly.
 */
export async function adminConfirmEmail(userId: string): Promise<{ id: string; emailConfirmedAt: string }> {
  const u = await authUser(userId);
  if (u.email_confirmed_at) return { id: userId, emailConfirmedAt: new Date(u.email_confirmed_at).toISOString() };
  if (env.auth.mode === "supabase") {
    if (!env.storage.serviceRoleKey) throw new HttpError(503, "Set SUPABASE_SERVICE_ROLE_KEY on the server to confirm emails from Admin.");
    const sb = createClient(env.auth.supabaseUrl!, env.storage.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) throw new HttpError(502, `Supabase couldn't confirm this email: ${error.message}`);
    return { id: userId, emailConfirmedAt: data.user?.email_confirmed_at ?? new Date().toISOString() };
  }
  const r = await queryOne<{ at: Date }>("update auth.users set email_confirmed_at = now() where id = $1 returning email_confirmed_at as at", [userId]);
  return { id: userId, emailConfirmedAt: new Date(r!.at).toISOString() };
}

/**
 * Send the sign-up confirmation email again (Supabase limits this to about one per minute per address).
 * Clicking the link confirms the email at Supabase; it then opens the sign-in page (no browser
 * code-verifier exists for a link requested from Admin, so it can't sign them in directly).
 */
export async function adminResendConfirmation(userId: string): Promise<{ id: string; email: string }> {
  const u = await authUser(userId);
  if (!u.email) throw badRequest("This user has no email address.");
  if (u.email_confirmed_at) throw conflict("This email is already confirmed.");
  if (env.auth.mode !== "supabase") throw new HttpError(503, "Emails are sent by Supabase Auth, which isn't configured here.");
  const sb = createClient(env.auth.supabaseUrl!, env.auth.supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.resend({ type: "signup", email: u.email, options: { emailRedirectTo: `${env.appUrl}/login` } });
  if (error) {
    if (/rate|seconds/i.test(error.message)) throw new HttpError(429, "Please wait a minute before sending another email to this address.");
    throw new HttpError(502, `Supabase couldn't send the email: ${error.message}`);
  }
  return { id: userId, email: u.email };
}
