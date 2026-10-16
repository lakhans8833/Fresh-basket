import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { LoginForm } from "@/components/account/login-form";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

function safeNext(n: string | undefined) {
  return safeNextPath(n);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      <LoginForm mode={env.auth.mode} next={next} linkError={sp.error === "expired" || sp.error === "device" || sp.error === "link" ? sp.error : undefined} />
    </div>
  );
}
