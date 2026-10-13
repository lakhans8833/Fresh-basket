import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { supabaseServerClient } from "@/lib/auth";

/** Supabase Auth email confirmation / magic-link redirect target. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  if (env.auth.mode === "supabase" && code) {
    const sb = await supabaseServerClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
