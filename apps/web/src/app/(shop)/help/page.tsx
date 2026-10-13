import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatINR } from "@freshbasket/shared";
import { getSettings, supportedPaymentMethods } from "@/lib/settings";
import { env } from "@/lib/env";
import { InfoPage } from "@/components/info/info-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Help & FAQs" };

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800">{children}</Link>
);

type Faq = { q: string; a: ReactNode };

export default async function HelpPage() {
  const s = await getSettings();
  const methods = supportedPaymentMethods(s);
  const holdMinutes = env.payments.reservationMinutes;
  const methodNames = methods.map((m) =>
    m === "razorpay" ? "online payment via Razorpay (UPI, cards or net banking)" : m === "cod" ? "cash on delivery" : "test payments (development mode only — no real money moves)",
  );
  const ahead = s.slotDaysAhead - 1;
  const daysText = ahead <= 0 ? "today only" : `today or up to ${ahead} day${ahead === 1 ? "" : "s"} ahead`;
  const hasOnline = methods.includes("razorpay") || methods.includes("mock");

  const sections: { title: string; id: string; faqs: Faq[] }[] = [
    {
      title: "Ordering",
      id: "ordering",
      faqs: [
        {
          q: "How do I place an order?",
          a: <p>Browse the <A href="/shop">shop</A>, choose a weight for each vegetable and add it to your basket. At checkout you sign in, pick or enter a delivery address, choose a delivery slot and a payment method, then place the order. You can follow it from <A href="/account/orders">your orders</A>.</p>,
        },
        {
          q: "How do weights and prices work?",
          a: <p>Each product is sold in fixed weight or pack options (for example 250 g, 500 g or 1 kg), each with its own price. The price shown is today&apos;s price; your basket total, any coupon discount and the delivery fee are confirmed by our server at checkout, so what you see there is what you pay.</p>,
        },
        {
          q: "Is there a minimum order amount?",
          a: <p>Minimum order amounts and delivery fees depend on your delivery area{s.defaultMinOrder > 0 ? ` (the general minimum is ${formatINR(s.defaultMinOrder)})` : ""}. Some areas offer free delivery above a certain basket value. See the <A href="/delivery-policy">delivery policy</A> for the current figures for each PIN code — checkout will also tell you if you&apos;re short of the minimum.</p>,
        },
        {
          q: "Can I reorder a previous basket?",
          a: <p>Yes. Open <A href="/account/orders">your orders</A> and choose <strong>Reorder</strong>. Items that are still available are added to your basket at today&apos;s prices; anything out of stock or no longer sold is skipped and we&apos;ll tell you which.</p>,
        },
      ],
    },
    {
      title: "Delivery",
      id: "delivery",
      faqs: [
        {
          q: "Do you deliver to my area?",
          a: <p>We deliver to a specific list of PIN codes. Enter your PIN code using the delivery checker in the header, or when adding an address — we&apos;ll tell you straight away. The full list is on the <A href="/delivery-policy">delivery policy</A> page.</p>,
        },
        {
          q: "How do delivery slots work?",
          a: <p>At checkout you choose a delivery date ({daysText}) and a time slot. Each slot stops taking orders at a cut-off time before it starts, and a slot can also close early once it&apos;s fully booked. Slot times and cut-offs are listed on the <A href="/delivery-policy">delivery policy</A> page.</p>,
        },
        {
          q: "How can I track my order?",
          a: <p>Every order has a tracking page showing its progress: placed, packed, out for delivery and delivered. Find it under <A href="/account/orders">your orders</A>.</p>,
        },
      ],
    },
    {
      title: "Payment",
      id: "payment",
      faqs: [
        {
          q: "Which payment methods can I use?",
          a: methodNames.length ? (
            <>
              <p>Right now you can pay by:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{methodNames.map((m) => <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</li>)}</ul>
              {methods.includes("razorpay") ? <p className="mt-2">Online payments are processed securely by Razorpay; we never see or store your card details.</p> : null}
            </>
          ) : (
            <p>Payment options are being set up. Please <A href="/contact">contact us</A> if you&apos;d like to order in the meantime.</p>
          ),
        },
        ...(hasOnline
          ? [{
              q: "What happens if I don't finish paying online?",
              a: <p>When you choose online payment, we hold the items in your order for {holdMinutes} minutes while you pay. If payment isn&apos;t completed in that time, the order is cancelled automatically and the items are released. While the hold lasts you can return to the order from <A href="/account/orders">your orders</A> and choose <strong>Complete payment</strong>.</p>,
            }]
          : []),
      ],
    },
    {
      title: "Cancellations & refunds",
      id: "cancellations",
      faqs: [
        {
          q: "Can I cancel my order?",
          a: <p>Yes, until we start packing it. Open the order from <A href="/account/orders">your orders</A> and choose <strong>Cancel order</strong>. Once an order is packed or out for delivery it can no longer be cancelled online — please <A href="/contact">contact us</A> instead.</p>,
        },
        {
          q: "How do refunds work?",
          a: <p>If an order you already paid for online is cancelled, it&apos;s marked <strong>Refund pending</strong> and the refund is made to your original payment method; the order page shows <strong>Refunded</strong> once it has been issued. For problems with delivered items, see our <A href="/returns">returns &amp; refunds</A> policy.</p>,
        },
      ],
    },
    {
      title: "Your account",
      id: "account",
      faqs: [
        {
          q: "How do I update my name, phone number or addresses?",
          a: <p>Go to <A href="/account">your profile</A> to change your name and mobile number. Under <A href="/account/addresses">addresses</A> you can add, edit and delete delivery addresses and choose a default one for checkout.</p>,
        },
        {
          q: "How do I contact you?",
          a: <p>Use the <A href="/contact">contact form</A> and include your order number if your question is about an order. We&apos;ll reply by email.</p>,
        },
      ],
    },
  ];

  return (
    <InfoPage eyebrow="Help centre" title="Help & FAQs" intro={`Answers to common questions about ordering from ${s.storeName}.`}>
      <nav aria-label="FAQ sections" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {sections.map((sec) => (
          <a key={sec.id} href={`#${sec.id}`} className="shrink-0 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft hover:bg-sage-50">{sec.title}</a>
        ))}
      </nav>

      {sections.map((sec) => (
        <section key={sec.id} id={sec.id} aria-labelledby={`${sec.id}-h`} className="mt-10 scroll-mt-28">
          <h2 id={`${sec.id}-h`} className="text-[1.375rem] font-semibold text-forest-900">{sec.title}</h2>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
            {sec.faqs.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-ink hover:bg-sage-50 focus-visible:bg-sage-50 [&::-webkit-details-marker]:hidden">
                  <h3 className="font-sans text-[0.9875rem] font-semibold">{f.q}</h3>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="px-5 pb-5 text-[0.9375rem] leading-relaxed text-ink-soft">{f.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-12 flex flex-col items-start gap-3 rounded-[var(--radius-card)] bg-lime-50 p-6 sm:flex-row sm:items-center">
        <p className="flex-1 text-[0.9375rem] text-ink-soft"><span className="font-semibold text-forest-900">Still need help?</span> Send us a message and we&apos;ll get back to you.</p>
        <ButtonLink href="/contact" variant="dark">Contact us</ButtonLink>
      </div>
    </InfoPage>
  );
}
