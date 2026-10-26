import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { InfoPage } from "@/components/info/info-page";
import { Grievance, operatorSentence, policyDate } from "@/components/info/legal";

export const metadata: Metadata = { title: "Terms of use" };

const a = "font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800";

export default async function TermsPage() {
  const s = await getSettings();
  return (
    <InfoPage eyebrow="Policies" title="Terms of use" updated={policyDate(s)}
      intro={`The terms that apply when you use ${s.storeName} and place orders with us.`}>
      <div className="prose-policy">
        <h2>1. About these terms</h2>
        <p>
          {operatorSentence(s) ? <>{operatorSentence(s)} </> : null}By creating an account or placing an order you agree to these terms, together with our{" "}
          <Link href="/privacy" className={a}>privacy policy</Link>, <Link href="/delivery-policy" className={a}>delivery policy</Link>{" "}
          and <Link href="/returns" className={a}>returns &amp; refunds policy</Link>.
        </p>

        <h2>2. Your account</h2>
        <ul>
          <li>You need an account to place an order. Please give accurate details, including a reachable mobile number for delivery.</li>
          <li>You&apos;re responsible for keeping your sign-in details secure and for orders placed from your account.</li>
          <li>We may suspend accounts that are used fraudulently or in breach of these terms.</li>
        </ul>

        <h2>3. Products and prices</h2>
        <ul>
          <li>Products are fresh produce sold in the weights or packs shown. Natural variation in size, appearance and exact weight is expected.</li>
          <li>Prices are in Indian Rupees. The total shown at checkout (item prices, less any discount, plus any delivery fee) is the amount you pay; nothing is added afterwards. Prices and availability can change at any time; the price that applies is the one confirmed at checkout when you place the order.</li>
          <li>Delivery fees and minimum order amounts depend on your delivery area and are shown before you pay.</li>
          <li>Coupons are subject to their own conditions (such as validity dates, minimum order and usage limits) and can&apos;t be exchanged for cash.</li>
        </ul>

        <h2>4. Orders</h2>
        <ul>
          <li>Placing an order is an offer to buy. The order is accepted when we confirm it — for online payments, once the payment is confirmed.</li>
          <li>If an item becomes unavailable, we may remove it from your order and refund or not charge for it. We may cancel an order if it can&apos;t be fulfilled, and we&apos;ll refund any payment made.</li>
          <li>You can cancel an order from your account until we start packing it.</li>
        </ul>

        <h2>5. Payment</h2>
        <ul>
          <li>We accept the payment methods shown at checkout, which may include online payment through Razorpay and cash on delivery.</li>
          <li>Online payments must be completed within the time shown at checkout; otherwise the order is cancelled automatically and the items are released.</li>
          <li>For cash on delivery, please pay the order total to the delivery person when you receive the order.</li>
        </ul>

        <h2>6. Delivery</h2>
        <p>
          We deliver to the areas and in the time slots listed in our <Link href="/delivery-policy" className={a}>delivery policy</Link>.
          We aim to deliver within the slot you choose, but times are estimates and may be affected by circumstances outside our
          control. Please ensure someone is available to receive the order; if you won&apos;t be, <Link href="/contact" className={a}>contact us</Link> as early as you can.
        </p>

        <h2>7. Problems with an order</h2>
        <p>
          If something is missing, damaged or not as ordered, please follow our <Link href="/returns" className={a}>returns &amp; refunds policy</Link>.
        </p>

        <h2>8. Acceptable use</h2>
        <p>
          Please don&apos;t misuse the website or app — for example by attempting to access other people&apos;s accounts or data,
          interfering with the service, or placing orders you don&apos;t intend to accept.
        </p>

        <h2>9. Liability</h2>
        <p>
          Nothing in these terms limits any rights you have under applicable consumer protection law, including the
          Consumer Protection Act, 2019.
        </p>

        <h2>10. Changes and governing law</h2>
        <p>
          We may update these terms from time to time; the version published here when you place an order applies to that order.
          These terms are governed by the laws of India{s.legal.jurisdiction ? `, and disputes are subject to the courts of ${s.legal.jurisdiction}` : ""}.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these terms? Please <Link href="/contact" className={a}>contact us</Link>.
        </p>
        <Grievance s={s} a={a} />
      </div>
    </InfoPage>
  );
}
