import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Setup check: tells you what is configured and whether the database is reachable and
 * migrated. Never returns secret values — only whether they are set.
 */
export async function GET() {
  let database: { ok: boolean; message: string; source: string };
  const prefixed = Object.keys(process.env).find((k) => k !== "POSTGRES_URL" && k.endsWith("_POSTGRES_URL") && process.env[k]);
  const source = process.env.DATABASE_URL ? "DATABASE_URL" : process.env.POSTGRES_URL ? "POSTGRES_URL" : prefixed ?? "not set (using localhost default)";
  try {
    const r = await pool.query("select (select count(*) from public.products)::int as products, (select count(*) from public.store_settings)::int as settings");
    const row = r.rows[0] as { products: number; settings: number };
    database = {
      ok: true,
      source,
      message: row.settings === 0 ? "Connected and migrated, but no store settings row — run supabase/seed.sql (or save settings in Admin)." : `Connected and migrated. ${row.products} products.`,
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const msg =
      err.code === "42P01" ? "Connected, but tables are missing — run supabase/all-migrations.sql in the Supabase SQL Editor."
      : err.code === "ECONNREFUSED" || /localhost|127\.0\.0\.1/.test(err.message ?? "") ? "Cannot reach the database — DATABASE_URL / POSTGRES_URL is not set for this environment."
      : err.code === "28P01" ? "Database password is wrong — check DATABASE_URL / POSTGRES_URL."
      : `Database error (${err.code ?? "unknown"}): ${(err.message ?? "").slice(0, 160)}`;
    database = { ok: false, source, message: msg };
  }
  return NextResponse.json(
    {
      database,
      auth: env.auth.mode,
      storage: env.storage.mode,
      onlinePayments: env.payments.online ?? "off (Cash on delivery only)",
      appSecretSet: Boolean(process.env.APP_SECRET),
      appSecretDerived: !process.env.APP_SECRET && Boolean(env.appSecret),
      appUrl: env.appUrl,
      cronSecretSet: Boolean(env.cronSecret),
    },
    { status: database.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
