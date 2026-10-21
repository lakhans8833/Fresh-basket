import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = { title: "Privacy policy" };

const a = "font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800";

export default async function PrivacyPage() {
  const s = await getSettings();
  return (
    <InfoPage eyebrow="Policies" title="Privacy policy" template updated="[date]"
      intro={`How ${s.storeName} collects, uses and protects your personal information.`}>
      <div className="prose-policy">
        <h2>1. Who we are</h2>
        <p>
          {s.storeName} is operated by [registered business name], [registered address]. In this policy &ldquo;we&rdquo;,
          &ldquo;us&rdquo; and &ldquo;our&rdquo; refer to that business. If you have questions about your data, please{" "}
          <Link href="/contact" className={a}>contact us</Link> or write to [privacy contact email].
        </p>

        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Account details</strong>: your email address (used to sign in), name and mobile number.</li>
          <li><strong>Delivery addresses</strong>: the addresses you save or enter at checkout, including recipient name, phone number, PIN code and any landmark.</li>
          <li><strong>Orders</strong>: the items you buy, prices, coupon codes used, delivery date and slot, any delivery note you add, and the status history of each order.</li>
          <li><strong>Payment references</strong>: for online payments, the payment and order reference numbers from our payment provider and the payment status. Card, UPI and bank details are entered on Razorpay&apos;s secure checkout and are handled by Razorpay — we do not receive or store them.</li>
          <li><strong>Messages</strong>: what you send us through the contact form (name, email, optional phone number and order number, and your message), and your email address if you sign up for our newsletter.</li>
          <li><strong>Technical data</strong>: basic information our servers receive when you use the site, such as your IP address (used, for example, to prevent abuse of forms) and server logs.</li>
        </ul>

        <h2>3. How we use it</h2>
        <ul>
          <li>To create and manage your account and let you sign in.</li>
          <li>To process, pack, deliver and support your orders, including contacting you about a delivery.</li>
          <li>To take payments and issue refunds.</li>
          <li>To answer your messages and resolve issues.</li>
          <li>To keep the service secure and prevent fraud or misuse.</li>
          <li>To send newsletters only if you have signed up for them. [Describe how to unsubscribe.]</li>
          <li>To meet our legal, tax and accounting obligations.</li>
        </ul>

        <h2>4. Cookies and browser storage</h2>
        <ul>
          <li><strong>Sign-in cookies</strong>: we use essential cookies to keep you signed in securely. The site can&apos;t work properly without them.</li>
          <li><strong>Your cart</strong>: the contents of your cart, your chosen delivery location and items you mark as favourites are stored in your own browser (local storage), not on our servers, until you place an order.</li>
          <li>[If you add analytics or marketing tools, describe them and how to opt out here.]</li>
        </ul>

        <h2>5. Who we share it with</h2>
        <p>We share personal information only where needed to run the service:</p>
        <ul>
          <li>our payment provider (Razorpay) to process online payments and refunds;</li>
          <li>our hosting, database and authentication providers [list providers, e.g. hosting and Supabase], who store data on our behalf;</li>
          <li>our staff and delivery personnel, who see the order and delivery details needed to fulfil it;</li>
          <li>authorities where required by law.</li>
        </ul>
        <p>We do not sell your personal information.</p>

        <h2>6. How long we keep it</h2>
        <p>
          We keep account and order information for as long as your account is active and afterwards for [period] to meet
          legal, tax and accounting requirements. Messages are kept for [period]. You can delete saved addresses from your
          account at any time.
        </p>

        <h2>7. Your choices and rights</h2>
        <ul>
          <li>You can view and update your name, mobile number and saved addresses in <Link href="/account" className={a}>your account</Link>.</li>
          <li>You can ask us for a copy of your information, to correct it, or to delete your account. You can <Link href="/delete-account" className={a}>delete your account yourself</Link> at any time, or <Link href="/contact" className={a}>contact us</Link>.</li>
          <li>[Describe rights under applicable data protection law, e.g. India&apos;s Digital Personal Data Protection Act, 2023, and grievance officer details.]</li>
        </ul>

        <h2>8. Security</h2>
        <p>
          We use encrypted connections (HTTPS), restrict access to customer data to the people who need it, and our database
          enforces that customers can only see their own addresses and orders. No system is perfectly secure, so please keep
          your sign-in details private.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>We may update this policy from time to time. We&apos;ll change the date at the top and, for significant changes, let you know.</p>
      </div>
    </InfoPage>
  );
}
