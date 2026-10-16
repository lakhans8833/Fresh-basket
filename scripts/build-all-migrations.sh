#!/usr/bin/env bash
# Rebuilds supabase/all-migrations.sql from supabase/migrations/*.sql (in filename order).
# The file ends by recording every migration in public._fb_migrations, so a database set up from it
# (Supabase SQL editor) is not migrated a second time by apps/web/scripts/migrate.mjs on the next deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/all-migrations.sql
{
  printf -- "-- Fresh Basket: all migrations in one file, for the Supabase SQL editor (run once on a NEW project).\n"
  printf -- "-- Normally not needed: migrations run automatically before each Vercel build (apps/web/scripts/migrate.mjs).\n"
  for f in supabase/migrations/*.sql; do printf "\n-- ===== %s =====\n" "$f"; cat "$f"; done
  printf "\n-- ===== record the migrations above as applied (for apps/web/scripts/migrate.mjs) =====\n"
  printf "create table if not exists public._fb_migrations (name text primary key, applied_at timestamptz not null default now());\n"
  printf "alter table public._fb_migrations enable row level security;\n"
  printf "insert into public._fb_migrations (name) values\n"
  first=1
  for f in supabase/migrations/*.sql; do
    n=$(basename "$f")
    if [ $first -eq 1 ]; then printf "  ('%s')" "$n"; first=0; else printf ",\n  ('%s')" "$n"; fi
  done
  printf "\non conflict (name) do nothing;\n"
} > "$out"
echo "wrote $out"
