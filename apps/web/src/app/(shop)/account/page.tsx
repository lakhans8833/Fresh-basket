import type { Metadata } from "next";
import { listMyOrders } from "@/lib/orders";
import { listAddresses } from "@/lib/account";
import { requireAccountSession } from "./require-session";
import { ProfileForm } from "@/components/account/profile-form";
import { AccountOverview } from "@/components/account/account-overview";

export const metadata: Metadata = { title: "Your profile" };

export default async function AccountPage() {
  const { userId, profile } = await requireAccountSession("/account");
  const [orders, addresses] = await Promise.all([listMyOrders(userId, 1), listAddresses(userId)]);
  const recent = orders[0];
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  return (
    <div className="space-y-6">
      <section aria-labelledby="profile-heading" className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-7">
        <h1 id="profile-heading" className="text-2xl font-semibold text-forest-900">Profile</h1>
        <p className="mt-1 text-sm text-muted">Your name and mobile number are used for delivery updates.</p>
        <ProfileForm profile={profile} />
      </section>

      <AccountOverview recent={recent ?? null} defaultAddress={defaultAddress ?? null} />
    </div>
  );
}
