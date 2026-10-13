#!/usr/bin/env bash
# Creates a local Postgres database that mirrors the Supabase schema, for development
# without a Supabase project. Requires a local PostgreSQL 15+ server you can connect to.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/freshbasket bash scripts/local-db.sh [--reset]
#
# With Supabase instead, run:  supabase db push   (migrations)  and  psql "$DATABASE_URL" -f supabase/seed.sql
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/freshbasket}"
ADMIN_URL="${DB_URL%/*}/postgres"
DB_NAME="${DB_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"

if [[ "${1:-}" == "--reset" ]]; then
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB_NAME\" with (force)"
fi
if ! psql "$ADMIN_URL" -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "create database \"$DB_NAME\""
  run() { echo "→ $1"; psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$1"; }
  run supabase/local/00_supabase_shim.sql
  for f in supabase/migrations/*.sql; do run "$f"; done
  run supabase/seed.sql
  run supabase/local/99_dev_users.sql
  echo "Local database ready: $DB_URL"
else
  echo "Database $DB_NAME already exists (use --reset to recreate)."
fi
