/**
 * ADMIN_EMAILS bootstrap (used by migrate.mjs on deploy).
 *
 * Promotes to admin only accounts whose identity is proven by Supabase Auth itself:
 *  - the email is matched on auth.users (which customers cannot edit), never on public.profiles.email
 *    (a profile column that used to be editable by its owner through the Supabase API);
 *  - auth.users.email_confirmed_at is set (the owner clicked the confirmation link) — this script never
 *    confirms an email itself, so someone who signs up first with the owner's address can't be promoted;
 *  - the account isn't deleted, banned or anonymous (when those Supabase columns exist);
 *  - the profile is joined by user id.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }} client
 * @param {string[]} emails lower-cased addresses from ADMIN_EMAILS
 * @returns {Promise<{ promoted: string[]; waitingForConfirmation: string[] }>}
 */
export async function promoteVerifiedAdmins(client, emails) {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!wanted.length) return { promoted: [], waitingForConfirmation: [] };
  const hasAuth = (await client.query("select to_regclass('auth.users') is not null as ok")).rows[0].ok;
  if (!hasAuth) return { promoted: [], waitingForConfirmation: [] };

  const cols = new Set(
    (await client.query("select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'")).rows.map(
      (r) => r.column_name,
    ),
  );
  const extra = [
    cols.has("deleted_at") ? "and u.deleted_at is null" : "",
    cols.has("banned_until") ? "and (u.banned_until is null or u.banned_until < now())" : "",
    cols.has("is_anonymous") ? "and not coalesce(u.is_anonymous, false)" : "",
  ].join(" ");

  const promoted = await client.query(
    `update public.profiles p set role = 'admin'
       from auth.users u
      where u.id = p.id
        and lower(u.email) = any($1::text[])
        and u.email_confirmed_at is not null
        ${extra}
        and p.role <> 'admin'
      returning lower(u.email) as email`,
    [wanted],
  );
  const waiting = await client.query(
    "select lower(email) as email from auth.users where lower(email) = any($1::text[]) and email_confirmed_at is null",
    [wanted],
  );
  return { promoted: promoted.rows.map((r) => r.email), waitingForConfirmation: waiting.rows.map((r) => r.email) };
}
