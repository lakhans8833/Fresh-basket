import type { ReactNode } from "react";
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
      <header className="border-b border-line bg-gradient-to-b from-lime-50 to-ivory">
        <div className={cn("container-page pb-8 pt-8 md:pb-12 md:pt-14", !wide && "max-w-[calc(48rem+4rem)]")}>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-[2.25rem] font-semibold leading-[1.1] text-forest-900 md:text-5xl">{title}</h1>
          {intro ? <div className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">{intro}</div> : null}
          {updated ? <p className="mt-3 text-sm text-muted">Last updated: {updated}</p> : null}
        </div>
      </header>
      <div className={cn("container-page pt-8 md:pt-10", !wide && "max-w-[calc(48rem+4rem)]")}>
        {template ? (
          <Notice tone="warning" title="Template" className="mb-8">
            Template — review with a legal adviser and update business details before launch.
          </Notice>
        ) : null}
        {children}
      </div>
    </div>
  );
}
