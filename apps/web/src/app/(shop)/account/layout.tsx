import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { AccountNav } from "@/components/account/account-nav";

export const metadata: Metadata = { robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Each account page redirects to sign-in with its own path as `next`; the layout only decorates.
  const session = await getSession();
  if (!session) return <>{children}</>;
  const { profile } = session;
  const firstName = profile.fullName?.trim().split(/\s+/)[0];
  const isStaff = profile.role === "admin" || profile.role === "staff";

  return (
    <div className="container-page pb-16 pt-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your account</p>
          <p className="mt-1 font-display text-[2rem] font-semibold leading-tight text-forest-900 md:text-[2.5rem]">
            {firstName ? `Hi, ${firstName}` : "Hi there"}
          </p>
          {profile.email ? <p className="mt-0.5 text-sm text-muted">{profile.email}</p> : null}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 md:mt-8 md:grid-cols-[13.5rem_minmax(0,1fr)] md:items-start lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <AccountNav isStaff={isStaff} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
