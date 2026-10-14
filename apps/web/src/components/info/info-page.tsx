import type { ReactNode } from "react";
import Image from "next/image";
import { Notice } from "../ui/feedback";
import { cn } from "../ui/cn";

/** Header + body wrapper shared by the information and policy pages. */
export function InfoPage({
  eyebrow, title, intro, children, wide, template, updated,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  /** Use the full page width (e.g. for a form + side panel). Text pages stay at ~48rem. */
  wide?: boolean;
  /** Show the "template" notice used on legal-ish pages. */
  template?: boolean;
  updated?: string;
}) {
  return (
    <div className="pb-16">
      <header className="relative overflow-hidden border-b border-line bg-gradient-to-r from-lime-50 via-[#eef6e4] to-[#e3f0d6]">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 lg:block">
          <Image src="/images/dev/banner-veg.jpg" alt="" fill sizes="50vw" className="object-cover [mask-image:linear-gradient(to_right,transparent,black_35%)]" />
        </div>
        <div className="container-page relative pb-8 pt-8 md:pb-12 md:pt-12">
          <p className="eyebrow text-leaf-600">{eyebrow}</p>
          <h1 className="mt-2 max-w-2xl text-[2.1rem] font-bold leading-[1.1] text-forest-800 md:text-[2.75rem]">{title}</h1>
          {intro ? <div className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">{intro}</div> : null}
          {updated ? <p className="mt-3 text-sm text-muted">Last updated: {updated}</p> : null}
        </div>
      </header>
      <div className="container-page pt-8 md:pt-10">
        <div className={cn(!wide && "max-w-3xl")}>
        {template ? (
          <Notice tone="warning" title="Template" className="mb-8">
            Template — review with a legal adviser and update business details before launch.
          </Notice>
        ) : null}
        {children}
        </div>
      </div>
    </div>
  );
}
