import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/account/reset-password-form";
import { safeNextPath } from "@/lib/safe-next";
import { RECOVERY_COOKIE, recoveryToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

/**
 * Reached from the "Forgot password?" email (via /auth/callback). What it offers depends on proof,
 * not on "someone is signed in":
 * - "recovery": this browser just completed a recovery link for the signed-in account (callback cookie);
 * - "change": signed in without such proof (e.g. another account was already signed in) — a normal
 *   password change for THAT account, clearly labelled with its email;
 * - "expired": not signed in — the link didn't work.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [session, sp, store] = await Promise.all([getSession(), searchParams, cookies()]);
  const mode = !session ? "expired" : recoveryToken.verify(session.userId, store.get(RECOVERY_COOKIE)?.value) ? "recovery" : "change";
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      <ResetPasswordForm mode={mode} email={session?.profile.email ?? null} next={safeNextPath(sp.next)} />
    </div>
  );
}
