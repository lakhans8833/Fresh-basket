import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MapPin, Search, ShoppingBasket, Truck } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { InfoPage } from "@/components/info/info-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About us" };

const STEPS = [
  { icon: Search, title: "Browse", body: "Shop vegetables by category or search. Each item lists its available weights and today's price." },
  { icon: ShoppingBasket, title: "Fill your cart", body: "Pick the weight you want and add it to your cart. Prices and totals are confirmed at checkout." },
  { icon: CalendarClock, title: "Choose a slot", body: "Select a delivery date and time slot that suits you from the slots still open for ordering." },
  { icon: Truck, title: "Get it delivered", body: "Track your order from your account as it's packed and sent out for delivery to your door." },
];

export default async function AboutPage() {
  const s = await getSettings();
  return (
    <InfoPage eyebrow={`About ${s.storeName}`} title={`Hello from ${s.storeName}`} intro={s.tagline || undefined}>
      <div className="prose-policy">
        <p>
          {s.storeName} is an online shop for everyday vegetables. You choose what you need, pick a delivery slot,
          and we bring your order to your door in the areas we serve.
        </p>
        <p>
          We keep things simple: clear prices per weight, delivery slots you can plan around, and an account where you
          can follow every order and reorder your regular basket in a tap.
        </p>
      </div>

      <h2 className="mt-10 text-[1.375rem] font-semibold text-forest-900">How it works</h2>
      <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="rounded-[var(--radius-card)] border border-line bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-lime-100 text-forest-700"><Icon className="size-5" aria-hidden /></span>
              <h3 className="text-lg font-semibold text-forest-900"><span className="sr-only">Step {i + 1}: </span>{title}</h3>
            </div>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
          </li>
        ))}
      </ol>

      <div className="prose-policy">
        <h2>Where we deliver</h2>
        <p>
          We deliver to a set list of PIN codes. Delivery fees and minimum order amounts depend on your area — see the{" "}
          <Link href="/delivery-policy" className="font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800">delivery policy</Link>{" "}
          for the current list, slot times and ordering cut-offs.
        </p>
        <h2>Questions?</h2>
        <p>
          Our <Link href="/help" className="font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800">help page</Link> answers
          the common ones. For anything else, including a question about an order, please{" "}
          <Link href="/contact" className="font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800">contact us</Link>.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-forest-800 p-6 text-white">
        <MapPin className="size-5 text-lime-300" aria-hidden />
        <p className="flex-1 text-[0.9375rem]">Ready to fill your cart?</p>
        <ButtonLink href="/shop" variant="lime">Shop vegetables</ButtonLink>
      </div>
    </InfoPage>
  );
}
