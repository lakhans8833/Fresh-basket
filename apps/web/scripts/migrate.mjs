#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql (in order) that haven't been applied yet, and loads
 * supabase/seed.sql once on a fresh database. Runs before `next build` on Vercel so a
 * newly connected Supabase database is set up automatically.
 *
 * - Skipped when no database URL is set, or when SKIP_DB_MIGRATIONS=true.
 * - Applied migration names are recorded in public._fb_migrations.
 * - SEED_SAMPLE_DATA=false skips the sample catalogue on first setup.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const migrationsDir = path.join(root, "supabase/migrations");
const seedFile = path.join(root, "supabase/seed.sql");

/** Standard name, or the same name with a Vercel ↔ Supabase "Custom Prefix" (e.g. STORAGE_POSTGRES_URL). Mirrors src/lib/env-alias.ts. */
function envAlias(name) {
  const clean = (v) => (v && v.trim() !== "" ? v.trim() : undefined);
  if (clean(process.env[name])) return clean(process.env[name]);
  const key = Object.keys(process.env)
    .filter((k) => k !== name && !k.includes("NEXT_PUBLIC") && k.endsWith(`_${name}`) && /^[A-Z0-9_]+$/.test(k) && clean(process.env[k]))
    .sort()[0];
  return key ? clean(process.env[key]) : undefined;
}

const nonPooling = envAlias("POSTGRES_URL_NON_POOLING");
const raw =
  process.env.MIGRATIONS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  (nonPooling?.includes("pooler") ? nonPooling : undefined) ||
  envAlias("POSTGRES_URL");

if (process.env.SKIP_DB_MIGRATIONS === "true" || !raw) {
  console.log(`[migrate] skipped (${raw ? "SKIP_DB_MIGRATIONS=true" : "no database URL configured"})`);
  process.exit(0);
}
if (!existsSync(migrationsDir)) {
  console.log("[migrate] skipped (supabase/migrations not found)");
  process.exit(0);
}

const needsSsl = /supabase\.(co|com)|sslmode=require/.test(raw);
const [base, query = ""] = raw.split("?");
const kept = query.split("&").filter((kv) => kv && !/^(sslmode|supa|pgbouncer)=/.test(kv));
const connectionString = kept.length ? `${base}?${kept.join("&")}` : base;

const client = new pg.Client({ connectionString, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });

try {
  await client.connect();
  await client.query(`create table if not exists public._fb_migrations (name text primary key, applied_at timestamptz not null default now())`);
  await client.query(`alter table public._fb_migrations enable row level security`);
  const done = new Set((await client.query("select name from public._fb_migrations")).rows.map((r) => r.name));

  // A database migrated by hand (SQL editor, all-migrations.sql) before this script existed:
  // record the baseline migrations as applied instead of re-running them. Later files still run.
  const BASELINE = "20261014000004_storage.sql";
  if (done.size === 0) {
    const { rows } = await client.query("select to_regclass('public.orders') is not null as exists");
    if (rows[0].exists) {
      for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql") && f <= BASELINE)) {
        await client.query("insert into public._fb_migrations (name) values ($1) on conflict do nothing", [f]);
        done.add(f);
      }
      console.log("[migrate] existing schema detected; recorded migrations as applied");
    }
  }

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(path.join(migrationsDir, f), "utf8");
    console.log(`[migrate] applying ${f}`);
    await client.query("begin");
    try {
      // Two deployments building at once against the same database must not apply the same file twice.
      // A transaction-level lock is released at commit, so it is safe behind Supabase's pooler.
      await client.query("select pg_advisory_xact_lock(727274001)");
      if ((await client.query("select 1 from public._fb_migrations where name = $1", [f])).rowCount) {
        await client.query("commit");
        continue;
      }
      await client.query(sql);
      await client.query("insert into public._fb_migrations (name) values ($1)", [f]);
      await client.query("commit");
      applied++;
    } catch (e) {
      await client.query("rollback");
      throw new Error(`${f}: ${e.message}`);
    }
  }

  const { rows: s } = await client.query("select count(*)::int as n from public.store_settings");
  if (s[0].n === 0 && process.env.SEED_SAMPLE_DATA !== "false" && existsSync(seedFile)) {
    console.log("[migrate] fresh database: loading supabase/seed.sql (sample data)");
    await client.query("begin");
    await client.query(readFileSync(seedFile, "utf8"));
    await client.query("commit");
  }
  // ADMIN_EMAILS (comma-separated): accounts the owner wants as admins. Already signed-up
  // users with these emails get role 'admin' and, if still unconfirmed, a confirmed email.
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.length) {
    const hasAuth = (await client.query("select to_regclass('auth.users') is not null as ok")).rows[0].ok;
    if (hasAuth) {
      const c = await client.query(
        "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where lower(email) = any($1::text[]) returning email",
        [adminEmails],
      );
      const r = await client.query(
        "update public.profiles set role = 'admin' where lower(email) = any($1::text[]) and role <> 'admin' returning email",
        [adminEmails],
      );
      console.log(`[migrate] ADMIN_EMAILS: ${c.rowCount} account(s) found, ${r.rowCount} promoted to admin`);
    }
  }

  console.log(`[migrate] done (${applied} new migration${applied === 1 ? "" : "s"})`);
} catch (e) {
  console.error("[migrate] FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
