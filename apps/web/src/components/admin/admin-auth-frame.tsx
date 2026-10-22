import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LeafMark } from "../layout/logo";

/** Full-screen frame for the staff sign-in and admin 404 pages (no store header/footer). */
export function AdminAuthFrame({ storeName, children }: { storeName: string; children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="focus:outline-none relative grid min-h-dvh place-items-center overflow-hidden bg-forest-900 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-forest-800/70" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-[22rem] rounded-full bg-lime-300/10" />
      <div className="relative w-full max-w-[26rem]">
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <LeafMark className="size-9 shrink-0 text-lime-300" />
            <span className="leading-tight">
              <span className="block font-display text-[1.2rem] font-semibold lowercase tracking-[-0.03em] text-ivory">{storeName}.</span>
              <span className="flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-lime-200/80">
                <ShieldCheck className="size-3" aria-hidden /> Staff area
              </span>
            </span>
          </span>
          <Link href="/" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-ivory/80 hover:bg-white/10 hover:text-ivory">
            <ArrowLeft className="size-4" aria-hidden /> Store
          </Link>
        </div>
        <div className="rounded-[1.5rem] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:p-8">{children}</div>
      </div>
    </main>
  );
}
