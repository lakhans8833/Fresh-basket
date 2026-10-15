import "server-only";
import type { Profile } from "@freshbasket/shared";
import { query, tx } from "../db";
import { badRequest, conflict, notFound } from "../http";

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
