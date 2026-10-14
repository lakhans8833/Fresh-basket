import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/account/reset-password-form";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

/** Reached from the "Forgot password?" email (via /auth/callback, which signs the customer in). */
export default async function ResetPasswordPage() {
  const session = await getSession();
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      <ResetPasswordForm signedIn={Boolean(session)} />
    </div>
  );
}
