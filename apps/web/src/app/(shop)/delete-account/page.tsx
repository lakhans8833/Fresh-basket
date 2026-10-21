import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your account and what happens to your data.",
};

const a = "font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800";

/** Public page for app stores ("account deletion URL") and anyone who wants to leave. */
export default async function DeleteAccountPage() {
  const s = await getSettings();
  return (
    <InfoPage eyebrow="Your account" title="Delete your account" intro={`You can delete your ${s.storeName} account yourself, on the website or in the app.`}>
      <div className="prose-policy">
        <h2>How to delete it</h2>
        <ol>
          <li><Link href="/login?next=%2Faccount" className={a}>Sign in</Link> and open <Link href="/account" className={a}>Your account → Profile</Link> (in the app: Profile tab).</li>
          <li>Choose <strong>Delete my account</strong>, type <strong>DELETE</strong> and confirm.</li>
        </ol>
        <p>If an order is still on its way, finish or cancel it first — the account can be deleted once no order is open.</p>

        <h2>What is deleted</h2>
        <ul>
          <li>Your login (email and password), name and mobile number.</li>
          <li>Your saved delivery addresses, product reviews and coupon history.</li>
        </ul>

        <h2>What is kept</h2>
        <ul>
          <li>
            Past orders (items, amounts, delivery address and payment status) stay in the store&apos;s records, because they are needed for
            accounts and tax. They are no longer linked to any account.
          </li>
          <li>Messages you sent through the contact form, without a link to your account.</li>
        </ul>
        <p>
          Can&apos;t sign in? <Link href="/contact" className={a}>Contact us</Link> from the email address of your account and ask us to delete it.
        </p>
      </div>
    </InfoPage>
  );
}
