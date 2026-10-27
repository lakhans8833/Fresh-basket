"use client";

import { usePathname } from "next/navigation";
import { buildWhatsAppUrl } from "@freshbasket/shared";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { useCart } from "../cart/cart-context";

/**
 * Round WhatsApp chat button. Only rendered when a seller number is configured.
 * Kept compact (the "Need help?" label shows on hover/focus only) so it never covers page content such
 * as the cart's checkout buttons; hidden where the page already has its own WhatsApp action.
 */
export function WhatsAppFloat({ number, storeName }: { number: string; storeName: string }) {
  const pathname = usePathname();
  const { count, hydrated } = useCart();
  if (/^\/(order|checkout|pay|cart)/.test(pathname)) return null;
  // Above the phone "View cart" bar when the basket has items.
  // Product pages have their own "Order on WhatsApp" button (and a sticky Add to Cart bar on phones).
  const onProduct = pathname.startsWith("/product/");
  const href = buildWhatsAppUrl(number, `Hi ${storeName}, I have a question about my order.`);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className={`group fixed right-4 z-30 print:hidden ${hydrated && count > 0 ? "bottom-[8.75rem]" : "bottom-20"} ${onProduct ? "hidden md:flex" : "flex"} items-center gap-3 rounded-full bg-white p-1.5 shadow-[var(--shadow-lift)] ring-1 ring-line transition hover:-translate-y-0.5 md:bottom-6 md:right-6 md:hover:pr-5 md:focus-visible:pr-5`}
    >
      <span className="grid size-12 place-items-center rounded-full bg-whatsapp text-white">
        <WhatsAppIcon className="size-7" />
      </span>
      <span className="hidden text-sm leading-tight md:group-hover:block md:group-focus-visible:block">
        <span className="block font-semibold text-ink">Need help?</span>
        <span className="block text-muted">Chat with us on WhatsApp</span>
      </span>
    </a>
  );
}
