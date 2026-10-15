import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/account/reset-password-form";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

/** Reached from the "Forgot password?" email (via /auth/callback, which signs the customer in). */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      <ResetPasswordForm signedIn={Boolean(session)} next={safeNextPath(sp.next)} />
    </div>
  );
}
