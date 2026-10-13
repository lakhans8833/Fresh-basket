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

const raw =
  process.env.MIGRATIONS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  (process.env.POSTGRES_URL_NON_POOLING?.includes("pooler") ? process.env.POSTGRES_URL_NON_POOLING : undefined) ||
  process.env.POSTGRES_URL;

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

  // A database migrated by hand (SQL editor) before this script existed: record, don't re-run.
  if (done.size === 0) {
    const { rows } = await client.query("select to_regclass('public.orders') is not null as exists");
    if (rows[0].exists) {
      for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
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
  console.log(`[migrate] done (${applied} new migration${applied === 1 ? "" : "s"})`);
} catch (e) {
  console.error("[migrate] FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
