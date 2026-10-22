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
    where = `where lower(coalesce(u.email, p.email, '')) like $1 or lower(coalesce(p.full_name, '')) like $1 or coalesce(p.phone, '') like $1`;
  }
  const rows = await query<{
    id: string; email: string | null; full_name: string | null; phone: string | null; role: Profile["role"];
    created_at: Date | null; email_confirmed_at: Date | null; last_sign_in_at: Date | null; orders: number;
  }>(
    `select p.id, coalesce(u.email, p.email) as email, -- the Supabase Auth address is the trusted one
            p.full_name, p.phone, p.role,
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

/**
 * Edit a user's name, mobile and sign-in email (Admin → Users → Edit).
 * The email is the login: it is changed in Supabase Auth (the source of truth) and marked confirmed,
 * because an admin is vouching for it; the profile copy follows. Refused if another account already
 * uses that address.
 */
export async function adminUpdateUser(
  userId: string,
  input: { fullName: string; phone: string | null; email: string },
): Promise<{ id: string; email: string; fullName: string; phone: string | null; emailConfirmedAt: string | null }> {
  const u = await authUser(userId);
  const email = input.email.trim().toLowerCase();
  const emailChanged = (u.email ?? "").toLowerCase() !== email;
  if (emailChanged) {
    const taken = await queryOne("select 1 from auth.users where lower(email) = $1 and id <> $2", [email, userId]);
    if (taken) throw conflict("Another account already uses that email.", undefined, "EMAIL_TAKEN");
    if (env.auth.mode === "supabase") {
      if (!env.storage.serviceRoleKey) throw new HttpError(503, "Set SUPABASE_SERVICE_ROLE_KEY on the server to change emails from Admin.");
      const sb = createClient(env.auth.supabaseUrl!, env.storage.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await sb.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) {
        if (/already|exists|registered/i.test(error.message)) throw conflict("Another account already uses that email.", undefined, "EMAIL_TAKEN");
        throw new HttpError(502, `Supabase couldn't change the email: ${error.message}`);
      }
    } else {
      await query("update auth.users set email = $2, email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [userId, email]);
    }
  }
  const row = await queryOne<{ full_name: string; phone: string | null; email: string; confirmed: Date | null }>(
    `update profiles p set full_name = $2, phone = $3, email = $4 where p.id = $1
     returning p.full_name, p.phone, p.email, (select email_confirmed_at from auth.users where id = $1) as confirmed`,
    [userId, input.fullName.trim(), input.phone, email],
  );
  if (!row) throw notFound("User not found.");
  return { id: userId, email: row.email, fullName: row.full_name, phone: row.phone, emailConfirmedAt: row.confirmed ? new Date(row.confirmed).toISOString() : null };
}

function adminAuthClient(what: string) {
  if (env.auth.mode !== "supabase") throw new HttpError(503, `Passwords are managed by Supabase Auth, which isn't configured here — ${what} isn't available.`);
  if (!env.storage.serviceRoleKey) throw new HttpError(503, `Set SUPABASE_SERVICE_ROLE_KEY on the server to ${what} from Admin.`);
  return createClient(env.auth.supabaseUrl!, env.storage.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Ends every session of a user (other devices are signed out). Best effort: the password change already happened. */
async function endAllSessions(userId: string) {
  await query("delete from auth.sessions where user_id = $1", [userId]).catch(() => undefined);
}

/**
 * A one-time password-reset link for a user who can't sign in (Admin → Users → Edit → Password).
 * It works on any phone or browser (it carries a token_hash that /auth/callback verifies on the server)
 * and doesn't depend on the email service: the admin sends it over WhatsApp or copies it.
 * Supabase's normal recovery-link expiry applies (1 hour by default).
 */
export async function adminCreateResetLink(actorId: string, userId: string, origin: string): Promise<{ id: string; email: string; link: string }> {
  if (actorId === userId) throw badRequest("Change your own password from Your account → Profile → Change password.");
  const u = await authUser(userId);
  if (!u.email) throw badRequest("This user has no email address.");
  const sb = adminAuthClient("create a reset link");
  const { data, error } = await sb.auth.admin.generateLink({ type: "recovery", email: u.email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) throw new HttpError(502, `Supabase couldn't create the link: ${error?.message ?? "no token returned"}`);
  const link = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent("/reset-password")}`;
  return { id: userId, email: u.email, link };
}

/**
 * Set a new password for a user (Admin → Users → Edit → Password). The admin tells the person the
 * password; all their sessions end, so the old password and any signed-in device stop working.
 */
export async function adminSetPassword(actorId: string, userId: string, password: string): Promise<{ id: string }> {
  if (actorId === userId) throw badRequest("Change your own password from Your account → Profile → Change password.");
  await authUser(userId);
  if (password.length < 8 || password.length > 72) throw badRequest("Use 8 to 72 characters.");
  const sb = adminAuthClient("set passwords");
  const { error } = await sb.auth.admin.updateUserById(userId, { password });
  if (error) {
    if (/weak|short|pwned|characters/i.test(error.message)) throw badRequest(`That password isn't allowed: ${error.message}`);
    throw new HttpError(502, `Supabase couldn't set the password: ${error.message}`);
  }
  await endAllSessions(userId);
  return { id: userId };
}
