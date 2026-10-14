import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { InfoPage } from "@/components/info/info-page";
import { ContactForm } from "@/components/info/contact-form";

export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [s, session, sp] = await Promise.all([getSettings(), getSession(), searchParams]);
  const p = session?.profile;
  const details = [
    s.supportPhone && { icon: Phone, label: "Phone", value: s.supportPhone, href: `tel:${s.supportPhone.replace(/\s/g, "")}` },
    s.whatsapp && { icon: MessageCircle, label: "WhatsApp", value: s.whatsapp, href: `https://wa.me/${s.whatsapp.replace(/\D/g, "")}`, external: true },
    s.supportEmail && { icon: Mail, label: "Email", value: s.supportEmail, href: `mailto:${s.supportEmail}` },
    s.address && { icon: MapPin, label: "Address", value: s.address },
    s.supportHours && { icon: Clock, label: "Hours", value: s.supportHours },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string; external?: boolean }[];

  return (
    <InfoPage
      wide
      eyebrow="Contact"
      title="We're here to help"
      intro={<>Send us a message about an order, a delivery or anything else. Many questions are already answered on our <Link href="/help" className="font-medium text-leaf-600 underline underline-offset-4 hover:text-forest-800">help page</Link>.</>}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
        <section aria-labelledby="form-heading" className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-7">
          <h2 id="form-heading" className="text-2xl font-semibold text-forest-900">Send a message</h2>
          <p className="mt-1 text-sm text-muted">We reply by email. Fields marked optional can be left blank.</p>
          <ContactForm
            initial={{ name: p?.fullName ?? "", email: p?.email ?? "", phone: p?.phone ?? "", orderNumber: (sp.order ?? "").slice(0, 40) }}
          />
        </section>

        <aside aria-labelledby="details-heading" className="rounded-[var(--radius-card)] border border-line bg-sage-50 p-5 sm:p-6">
          <h2 id="details-heading" className="font-sans text-sm font-semibold uppercase tracking-[0.1em] text-muted">Other ways to reach us</h2>
          {details.length ? (
            <ul className="mt-4 space-y-4">
              {details.map(({ icon: Icon, label, value, href, external }) => (
                <li key={label} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-forest-700"><Icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                    {href ? (
                      <a href={href} className="break-words font-medium text-ink hover:text-leaf-600" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{value}</a>
                    ) : (
                      <p className="whitespace-pre-line break-words text-ink">{value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[0.9375rem] text-ink-soft">The contact form is the best way to reach us — we&apos;ll reply to the email address you provide.</p>
          )}
          {session ? (
            <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
              Asking about an order? Your order numbers are listed in <Link href="/account/orders" className="font-medium text-leaf-600 hover:text-forest-800">your orders</Link>.
            </p>
          ) : null}
        </aside>
      </div>
    </InfoPage>
  );
}
