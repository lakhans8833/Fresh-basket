import Link from "next/link";
import { Banknote, CreditCard, Landmark, Mail, MapPin, Phone, Clock, MessageCircle, FlaskConical } from "lucide-react";
import type { Category, StoreSettings } from "@freshbasket/shared";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter-form";
import { InstallAppButton } from "./install-app";

function SocialIcon({ kind }: { kind: "instagram" | "facebook" | "youtube" | "x" }) {
  const paths: Record<typeof kind, React.ReactNode> = {
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
      </>
    ),
    facebook: <path d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3.1Z" fill="currentColor" />,
    youtube: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m10 9.2 5 2.8-5 2.8V9.2Z" fill="currentColor" />
      </>
    ),
    x: <path d="M4 4h4.6l3.8 5.3L16.9 4H20l-6.1 7.1L20.5 20h-4.6l-4.1-5.7L6.9 20H3.8l6.6-7.6L4 4Z" fill="currentColor" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="size-[1.15rem]" aria-hidden>
      {paths[kind]}
    </svg>
  );
}

const SOCIAL_LABEL = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", x: "X (Twitter)" } as const;

function PaymentChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] px-3 text-[0.8125rem] font-medium text-white/90">
      {icon}
      {label}
    </li>
  );
}

export function SiteFooter({
  settings, categories, paymentMethods, serviceArea,
}: { settings: StoreSettings; categories: Category[]; paymentMethods: string[]; serviceArea: string }) {
  const socials = (Object.keys(settings.social) as (keyof StoreSettings["social"])[]).filter((k) => settings.social[k]);
  const hasContact = settings.supportPhone || settings.supportEmail || settings.address || settings.whatsapp;
  const year = new Date().getFullYear();
  const linkCls = "rounded hover:text-white hover:underline underline-offset-4";

  return (
    <footer className="mt-16 md:mt-20">
      <div className="bg-forest-800 text-white">
        <div className="container-page grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.9fr_0.9fr_1.35fr]">
          <div>
            <div className="inline-flex rounded-2xl bg-white px-3 py-2.5">
              <Logo name={settings.storeName} logoUrl={settings.logoUrl} tagline={settings.tagline} size="md" />
            </div>
            <p className="mt-4 max-w-xs text-[0.9375rem] leading-relaxed text-white/80">
              Fresh vegetables delivered to your home in {serviceArea}.
            </p>
            {socials.length ? (
              <ul className="mt-5 flex gap-2" aria-label="Social media">
                {socials.map((k) => (
                  <li key={k}>
                    <a
                      href={settings.social[k]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_LABEL[k]}
                      className="grid size-10 place-items-center rounded-full border border-white/20 text-white/90 transition-colors hover:border-lime-300 hover:bg-lime-300 hover:text-forest-900"
                    >
                      <SocialIcon kind={k} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <InstallAppButton storeName={settings.storeName} />
          </div>

          <nav aria-labelledby="f-shop">
            <h2 id="f-shop" className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-lime-200">Shop</h2>
            <ul className="mt-4 space-y-2.5 text-[0.9375rem] text-white/80">
              <li><Link className={linkCls} href="/shop">All products</Link></li>
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}><Link className={linkCls} href={`/category/${c.slug}`}>{c.name}</Link></li>
              ))}
              <li><Link className={linkCls} href="/shop?seasonal=1">In season now</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="f-help">
            <h2 id="f-help" className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-lime-200">Help</h2>
            <ul className="mt-4 space-y-2.5 text-[0.9375rem] text-white/80">
              <li><Link className={linkCls} href="/about">About us</Link></li>
              <li><Link className={linkCls} href="/contact">Contact</Link></li>
              <li><Link className={linkCls} href="/help">FAQs</Link></li>
              <li><Link className={linkCls} href="/delivery-policy">Delivery areas &amp; charges</Link></li>
              <li><Link className={linkCls} href="/returns">Returns &amp; refunds</Link></li>
              <li><Link className={linkCls} href="/account/orders">Track your order</Link></li>
              <li><Link className={linkCls} href="/wishlist">Saved items</Link></li>
            </ul>
          </nav>

          <div className="space-y-6">
            <div>
              <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-lime-200">Get in touch</h2>
              {hasContact ? (
                <ul className="mt-4 space-y-3 text-[0.9375rem] text-white/85">
                  {settings.supportPhone ? (
                    <li className="flex gap-3"><Phone className="mt-0.5 size-4 shrink-0 text-lime-300" aria-hidden /><a className={linkCls} href={`tel:${settings.supportPhone.replace(/\s/g, "")}`}>{settings.supportPhone}</a></li>
                  ) : null}
                  {settings.whatsapp ? (
                    <li className="flex gap-3"><MessageCircle className="mt-0.5 size-4 shrink-0 text-lime-300" aria-hidden /><a className={linkCls} href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "").replace(/^(?=[6-9]\d{9}$)/, "91")}`} target="_blank" rel="noopener noreferrer">WhatsApp {settings.whatsapp}</a></li>
                  ) : null}
                  {settings.supportEmail ? (
                    <li className="flex gap-3"><Mail className="mt-0.5 size-4 shrink-0 text-lime-300" aria-hidden /><a className={`${linkCls} break-all`} href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></li>
                  ) : null}
                  {settings.address ? (
                    <li className="flex gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-lime-300" aria-hidden /><span className="whitespace-pre-line">{settings.address}</span></li>
                  ) : null}
                  {settings.supportHours ? (
                    <li className="flex gap-3"><Clock className="mt-0.5 size-4 shrink-0 text-lime-300" aria-hidden /><span>{settings.supportHours}</span></li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/80">
                  Questions about an order? <Link href="/contact" className="font-medium text-lime-200 underline-offset-4 hover:underline">Send us a message</Link>.
                </p>
              )}
            </div>
            <div>
              <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-lime-200">Fresh picks in your inbox</h2>
              <div className="mt-3"><NewsletterForm /></div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="container-page flex flex-col gap-5 py-6 lg:flex-row lg:items-center lg:justify-between">
            {paymentMethods.length ? (
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/80">We accept</span>
                <ul className="flex flex-wrap gap-2" aria-label="Accepted payment methods">
                  {paymentMethods.includes("razorpay") ? (
                    <>
                      <PaymentChip icon={<span className="text-[0.7rem] font-black italic tracking-tight">UPI</span>} label="UPI" />
                      <PaymentChip icon={<CreditCard className="size-4" aria-hidden />} label="Cards" />
                      <PaymentChip icon={<Landmark className="size-4" aria-hidden />} label="Net banking" />
                    </>
                  ) : null}
                  {paymentMethods.includes("cod") ? <PaymentChip icon={<Banknote className="size-4" aria-hidden />} label="Cash on delivery" /> : null}
                  {paymentMethods.includes("mock") ? <PaymentChip icon={<FlaskConical className="size-4" aria-hidden />} label="Test payments (dev only)" /> : null}
                </ul>
              </div>
            ) : <span />}
            <div className="flex flex-col gap-2 text-[0.8125rem] text-white/80 sm:flex-row sm:items-center sm:gap-5">
              <nav aria-label="Legal" className="flex gap-4">
                <Link href="/privacy" className="hover:text-white">Privacy</Link>
                <Link href="/terms" className="hover:text-white">Terms</Link>
              </nav>
              <span>© {year} {settings.storeName}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
