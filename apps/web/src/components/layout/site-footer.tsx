import Link from "next/link";
import { Banknote, CreditCard, Landmark, Mail, MapPin, Phone, Clock, FlaskConical, Headset } from "lucide-react";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
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

/** "919891244561" / "9891244561" → "+91 98912 44561"; anything else is shown as typed. */
function displayIndianNumber(raw: string) {
  const d = raw.replace(/\D/g, "");
  const local = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 10 ? d : null;
  return local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : raw;
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
  const waLink = settings.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "").replace(/^(?=[6-9]\d{9}$)/, "91")}` : null;
  const telLink = settings.supportPhone ? `tel:${settings.supportPhone.replace(/\s/g, "")}` : null;
  const year = new Date().getFullYear();
  const linkCls = "rounded transition-colors hover:text-white hover:underline underline-offset-4";
  const headCls = "flex items-center gap-2 font-sans text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-lime-200 before:h-3.5 before:w-1 before:rounded-full before:bg-lime-300";
  const iconWrap = "grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-lime-300";

  return (
    <footer className="mt-16 md:mt-20 print:hidden">
      <div className="relative overflow-hidden bg-forest-900 text-white">
        {/* soft light in the corner so the green isn't one flat block */}
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[28rem] rounded-full bg-lime-300/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 size-[24rem] rounded-full bg-forest-600/30 blur-3xl" />

        {/* Help strip: the fastest way to reach the store */}
        <div className="container-page relative pt-10 md:pt-12">
          <div className="flex flex-col gap-5 rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10 md:flex-row md:items-center md:justify-between md:p-6">
            <div className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime-300 text-forest-900"><Headset className="size-6" aria-hidden /></span>
              <div>
                <p className="font-display text-lg font-bold leading-tight md:text-xl">Need help with your order?</p>
                <p className="mt-0.5 text-sm text-white/75">{settings.supportHours ? `We're here to help · ${settings.supportHours}` : "We're here to help."}</p>
              </div>
            </div>
            <div className="grid gap-2.5 sm:flex sm:flex-wrap [&>a]:justify-center">
              {telLink ? (
                <a href={telLink} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-forest-900 transition-colors hover:bg-lime-100">
                  <Phone className="size-4" aria-hidden /> Call {settings.supportPhone}
                </a>
              ) : null}
              {waLink ? (
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-whatsapp px-5 text-sm font-semibold text-forest-950 transition-colors hover:bg-lime-300">
                  <WhatsAppIcon className="size-5" /> Chat on WhatsApp
                </a>
              ) : null}
              {!telLink && !waLink ? (
                <Link href="/contact" className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-forest-900 hover:bg-lime-100">Contact us</Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="container-page relative grid grid-cols-2 gap-x-6 gap-y-10 py-12 lg:grid-cols-[1.3fr_0.85fr_0.95fr_1.4fr] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <div className="inline-flex rounded-2xl bg-white px-3 py-2.5 shadow-lg shadow-black/10">
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
            <h2 id="f-shop" className={headCls}>Shop</h2>
            <ul className="mt-4 space-y-2.5 text-[0.9375rem] text-white/80">
              <li><Link className={linkCls} href="/shop">All products</Link></li>
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}><Link className={linkCls} href={`/category/${c.slug}`}>{c.name}</Link></li>
              ))}
              <li><Link className={linkCls} href="/shop?seasonal=1">In season now</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="f-help">
            <h2 id="f-help" className={headCls}>Help</h2>
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

          <div className="col-span-2 space-y-8 lg:col-span-1">
            <div>
              <h2 className={headCls}>Get in touch</h2>
              {hasContact ? (
                <ul className="mt-4 space-y-2.5 text-[0.9375rem] text-white/85">
                  {telLink ? (
                    <li className="flex items-center gap-3"><span className={iconWrap}><Phone className="size-4" aria-hidden /></span><a className={linkCls} href={telLink}>{settings.supportPhone}</a></li>
                  ) : null}
                  {waLink ? (
                    <li className="flex items-center gap-3"><span className={iconWrap}><WhatsAppIcon className="size-4" /></span><a className={linkCls} href={waLink} target="_blank" rel="noopener noreferrer">WhatsApp {displayIndianNumber(settings.whatsapp!)}</a></li>
                  ) : null}
                  {settings.supportEmail ? (
                    <li className="flex items-center gap-3"><span className={iconWrap}><Mail className="size-4" aria-hidden /></span><a className={`${linkCls} break-all`} href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></li>
                  ) : null}
                  {settings.address ? (
                    <li className="flex items-start gap-3"><span className={iconWrap}><MapPin className="size-4" aria-hidden /></span><span className="whitespace-pre-line pt-1.5">{settings.address}</span></li>
                  ) : null}
                  {settings.supportHours ? (
                    <li className="flex items-center gap-3"><span className={iconWrap}><Clock className="size-4" aria-hidden /></span><span>{settings.supportHours}</span></li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/80">
                  Questions about an order? <Link href="/contact" className="font-medium text-lime-200 underline-offset-4 hover:underline">Send us a message</Link>.
                </p>
              )}
            </div>
            <div>
              <h2 className={headCls}>Fresh picks in your inbox</h2>
              <p className="mt-2 text-sm text-white/70">Seasonal arrivals and offers, now and then.</p>
              <div className="mt-3"><NewsletterForm /></div>
            </div>
          </div>
        </div>

        <div className="relative bg-forest-950/60">
          <div className="container-page flex flex-col gap-5 pt-6 pb-24 md:pb-6 md:pr-24 lg:flex-row lg:items-center lg:justify-between">
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
              <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/privacy" className="hover:text-white">Privacy</Link>
                <Link href="/terms" className="hover:text-white">Terms</Link>
                <Link href="/returns" className="hover:text-white">Refunds</Link>
              </nav>
              <span>© {year} {settings.storeName}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
