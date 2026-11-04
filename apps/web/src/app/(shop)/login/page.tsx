import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { History, MapPin, PackageCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { emailCodesBySmtp, env } from "@/lib/env";
import { LoginForm } from "@/components/account/login-form";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

const BENEFITS = [
  [PackageCheck, "Track every order"],
  [History, "Order again in one tap"],
  [MapPin, "Saved addresses, faster checkout"],
] as const;

function safeNext(n: string | undefined) {
  return safeNextPath(n);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const linkError = sp.error === "expired" || sp.error === "device" || sp.error === "link" ? sp.error : undefined;
  const session = await getSession();
  // Already signed in → straight on. EXCEPT after a failed email link: the error must be shown, and a
  // session of another account is no proof the link worked (it must never lead to password reset).
  if (session && !linkError) redirect(next);
  return (
    <div className="container-page py-6 sm:py-12">
      <div className="mx-auto grid max-w-md overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-[var(--shadow-card)] lg:max-w-5xl lg:grid-cols-[1fr_1.05fr]">
        {/* Big screens: a picture panel beside the form, with what an account is for. */}
        <aside className="relative hidden min-h-[36rem] lg:block" aria-hidden>
          <Image src="/images/site/hero-veg-basket.webp" alt="" fill sizes="(min-width: 1024px) 30rem, 0px" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-900 via-forest-900/70 to-forest-900/10" />
          <div className="absolute inset-x-0 bottom-0 p-10 text-white">
            <p className="font-script text-2xl text-lime-200">Fresh vegetables · Healthy life</p>
            <p className="mt-2 font-display text-3xl font-semibold leading-tight">Your fresh basket, one sign-in away.</p>
            <ul className="mt-6 space-y-3 text-[0.95rem]">
              {BENEFITS.map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/25"><Icon className="size-[1.1rem] text-lime-200" /></span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <div className="flex items-center">
          <LoginForm embedded mode={env.auth.mode} emailByApp={emailCodesBySmtp()} next={next} linkError={linkError} signedInAs={linkError && session ? (session.profile.email ?? "your account") : null} />
        </div>
      </div>
      {/* Phones and tablets: the same three reasons, small, under the form. */}
      <ul className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-2 text-center text-xs font-medium text-forest-800 lg:hidden">
        {BENEFITS.map(([Icon, text]) => (
          <li key={text} className="flex flex-col items-center gap-1.5 rounded-2xl bg-lime-50 px-2 py-3 ring-1 ring-lime-100">
            <Icon className="size-5 text-leaf-600" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
