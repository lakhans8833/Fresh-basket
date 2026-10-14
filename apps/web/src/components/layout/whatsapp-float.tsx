"use client";

import { usePathname } from "next/navigation";
import { buildWhatsAppUrl } from "@freshbasket/shared";
import { WhatsAppIcon } from "../ui/whatsapp-icon";

/** "Need help? Chat with us on WhatsApp" bubble. Only rendered when a seller number is configured. */
export function WhatsAppFloat({ number, storeName }: { number: string; storeName: string }) {
  const pathname = usePathname();
  if (/^\/(order|checkout|pay)/.test(pathname)) return null;
  const href = buildWhatsAppUrl(number, `Hi ${storeName}, I have a question about ordering vegetables.`);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-20 right-4 z-30 flex items-center gap-3 rounded-full bg-white p-1.5 pr-1.5 shadow-[var(--shadow-lift)] ring-1 ring-line transition hover:-translate-y-0.5 md:bottom-6 md:right-6 md:pr-5"
    >
      <span className="grid size-12 place-items-center rounded-full bg-whatsapp text-white">
        <WhatsAppIcon className="size-7" />
      </span>
      <span className="hidden text-sm leading-tight md:block">
        <span className="block font-semibold text-ink">Need help?</span>
        <span className="block text-muted">Chat with us on WhatsApp</span>
      </span>
    </a>
  );
}
