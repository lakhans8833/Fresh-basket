import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = { title: "Returns & refunds" };

const a = "font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800";

export default async function ReturnsPage() {
  const s = await getSettings();
  return (
    <InfoPage eyebrow="Policies" title="Returns & refunds" template updated="[date]"
      intro="Fresh produce can't be resold once delivered, so instead of returns we put things right when something is wrong with your order.">
      <div className="prose-policy">
        <h2>1. What this policy covers</h2>
        <p>
          This policy applies to orders placed with {s.storeName} ([registered business name]) through our website or app.
          Because vegetables are perishable, we don&apos;t accept returns of items in good condition, but we will offer a
          refund or replacement where items are missing, damaged, spoiled or not what you ordered.
        </p>

        <h2>2. Checking your delivery</h2>
        <ul>
          <li>Please check your items when they&apos;re delivered. If possible, point out any damaged or missing items to the delivery person at the door.</li>
          <li>
            Otherwise, tell us within [24 hours] of delivery using our <Link href="/contact" className={a}>contact form</Link>.
            Include your order number, the affected items and, where helpful, a photo.
          </li>
          <li>Natural variation in size, shape and colour, and small differences in weight within [the tolerance stated on the product], are not considered defects.</li>
        </ul>

        <h2>3. How we resolve issues</h2>
        <p>
          Once we&apos;ve reviewed your report we will, at our discretion, offer one of the following for the affected items:
          a refund, a replacement with a later delivery, or [store credit if you choose to offer it]. We may ask you to keep
          or dispose of the affected items rather than return them.
        </p>

        <h2>4. Cancelled orders</h2>
        <ul>
          <li>You can cancel an order from your account until we start packing it.</li>
          <li>If an order you&apos;ve paid for online is cancelled — by you, by us, or because a payment arrived after the order had expired — a full refund is issued.</li>
          <li>Orders paid online that are not completed within the payment window are cancelled automatically and no money is taken.</li>
        </ul>

        <h2>5. How refunds are paid</h2>
        <ul>
          <li><strong>Online payments</strong>: refunds go back to the original payment method through our payment provider (Razorpay). Banks usually take [5–7 working days] to show the money in your account after the refund is issued.</li>
          <li><strong>Cash on delivery</strong>: if you paid cash and are owed a refund, we&apos;ll [refund by bank transfer / UPI to details you provide, or adjust against your next order — choose your process].</li>
          <li>Your order page shows <em>Refund pending</em> while a refund is being processed and <em>Refunded</em> once it has been issued.</li>
        </ul>

        <h2>6. Contact</h2>
        <p>
          For any question about a return or refund, please <Link href="/contact" className={a}>contact us</Link>.
          [Add any statutory grievance officer details required for your business here.]
        </p>
      </div>
    </InfoPage>
  );
}
