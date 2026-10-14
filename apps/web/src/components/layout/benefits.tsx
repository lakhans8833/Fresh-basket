import { Banknote, CreditCard, ShoppingBasket, Sprout, Truck } from "lucide-react";
import type { StoreSettings } from "@freshbasket/shared";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { cn } from "../ui/cn";

export interface Benefit {
  key: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}

/** Store promises that are true for this configuration (no invented claims). */
export function storeBenefits(settings: StoreSettings, opts: { whatsapp: boolean; serviceArea: string }): Benefit[] {
  const ic = "size-[1.35rem]";
  const out: Benefit[] = [
    { key: "fresh", icon: <Sprout className={ic} />, title: "Fresh vegetables", text: "Daily staples & seasonal picks" },
    { key: "delivery", icon: <Truck className={ic} />, title: "Doorstep delivery", text: opts.serviceArea },
    opts.whatsapp
      ? { key: "order", icon: <WhatsAppIcon className={ic} />, title: "Easy ordering", text: "via WhatsApp & website" }
      : { key: "order", icon: <ShoppingBasket className={ic} />, title: "Easy ordering", text: "Order online in minutes" },
  ];
  if (settings.codEnabled) {
    out.push({ key: "pay", icon: <Banknote className={ic} />, title: "Cash on delivery", text: settings.onlinePayment === "razorpay" ? "& online payment" : "Pay when it arrives" });
  } else if (settings.onlinePayment === "razorpay") {
    out.push({ key: "pay", icon: <CreditCard className={ic} />, title: "Secure payment", text: "UPI, cards & net banking" });
  }
  return out;
}

export function BenefitsStrip({ benefits, tone = "light", className }: { benefits: Benefit[]; tone?: "light" | "plain"; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4 lg:divide-x lg:divide-line", tone === "light" && "rounded-2xl bg-sage-50 px-4 py-5 sm:px-6", className)}>
      {benefits.map((b) => (
        <li key={b.key} className="flex items-center gap-3 lg:justify-center lg:px-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-forest-800/80 bg-white text-forest-800 sm:size-12">{b.icon}</span>
          <span className="min-w-0 text-sm leading-snug">
            <span className="block font-semibold text-ink">{b.title}</span>
            <span className="block text-muted">{b.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
