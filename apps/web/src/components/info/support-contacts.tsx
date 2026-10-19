import { Clock, Mail, MessageCircle, Phone } from "lucide-react";
import { normalizeWhatsAppNumber, type StoreSettings } from "@freshbasket/shared";
import { resolveWhatsAppNumber } from "@/config/store";

type SupportSettings = Pick<StoreSettings, "supportPhone" | "whatsapp" | "supportEmail" | "supportHours">;

/** The same WhatsApp number orders go to (NEXT_PUBLIC_WHATSAPP_NUMBER first, else Admin → Settings). */
export function supportWhatsApp(settings: SupportSettings) {
  return resolveWhatsAppNumber(settings.whatsapp) ?? normalizeWhatsAppNumber(settings.whatsapp);
}

/** "919000000000" → "+91 90000 00000" (Indian mobiles); other numbers just get a leading "+". */
export function displayWhatsApp(wa: string) {
  return /^91\d{10}$/.test(wa) ? `+91 ${wa.slice(2, 7)} ${wa.slice(7)}` : `+${wa}`;
}

/** True when at least one support detail is filled in (otherwise pages keep their plain /contact link). */
export function hasSupportContacts(settings: SupportSettings) {
  return Boolean(settings.supportPhone || supportWhatsApp(settings) || settings.supportEmail || settings.supportHours);
}
import { cn } from "../ui/cn";

/**
 * Call / WhatsApp / Email / Hours from Admin → Settings → Customer support. Only filled-in details
 * are shown (nothing is made up); renders nothing at all when none are set.
 */
export function SupportContacts({
  settings, orderNumber, title = "Need help?", className,
}: { settings: SupportSettings; orderNumber?: string; title?: string; className?: string }) {
  const wa = supportWhatsApp(settings);
  const waText = orderNumber ? `?text=${encodeURIComponent(`Hi, I need help with order ${orderNumber}.`)}` : "";
  const actions = [
    settings.supportPhone && { key: "call", icon: Phone, label: "Call", value: settings.supportPhone, href: `tel:${settings.supportPhone.replace(/[^\d+]/g, "")}` },
    wa && { key: "wa", icon: MessageCircle, label: "WhatsApp", value: displayWhatsApp(wa), href: `https://wa.me/${wa}${waText}`, external: true },
    settings.supportEmail && {
      key: "email", icon: Mail, label: "Email", value: settings.supportEmail,
      href: `mailto:${settings.supportEmail}${orderNumber ? `?subject=${encodeURIComponent(`Order ${orderNumber}`)}` : ""}`,
    },
  ].filter(Boolean) as { key: string; icon: typeof Phone; label: string; value: string; href: string; external?: boolean }[];
  if (!actions.length && !settings.supportHours) return null;
  return (
    <section aria-label={title} className={cn("rounded-[var(--radius-card)] border border-line bg-white p-5", className)}>
      <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.1em] text-muted">{title}</h3>
      {actions.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {actions.map(({ key, icon: Icon, label, value, href, external }) => (
            <li key={key}>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm hover:border-forest-700/40 hover:bg-sage-50"
              >
                <Icon className="size-4 shrink-0 text-forest-800" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{label}</span>
                  <span className="block truncate text-muted">{value}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {settings.supportHours ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft"><Clock className="size-4 text-forest-800" aria-hidden /> {settings.supportHours}</p>
      ) : null}
    </section>
  );
}
