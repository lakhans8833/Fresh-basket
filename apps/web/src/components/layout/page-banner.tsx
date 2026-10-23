import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

/** Slim green-tinted page header (title + one line) with a photo fading in on the right. */
export function PageBanner({
  title, subtitle, icon, image = "/images/site/banner-market.webp", script, children, className, as: Heading = "h1",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  image?: string;
  /** Short handwritten line on the far right, e.g. "Fresh From Farm To Your Home". */
  script?: string;
  children?: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <section className={cn("relative overflow-hidden border-b border-line bg-gradient-to-r from-lime-50 via-[#eef6e4] to-[#e3f0d6]", className)}>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] md:block">
        <Image src={image} alt="" fill priority sizes="60vw" className="object-cover object-center [mask-image:linear-gradient(to_right,transparent,black_28%)]" />
      </div>
      <div className="container-page relative flex min-h-[4.5rem] items-center py-3.5 md:min-h-[5.5rem]">
        <div className="relative z-10 flex min-w-0 items-center gap-4 md:max-w-[52%]">
          {icon ? <span className="hidden shrink-0 text-forest-800 sm:block [&_svg]:size-9">{icon}</span> : null}
          <div className="min-w-0">
            <Heading className="text-xl font-bold leading-tight text-ink sm:text-2xl md:text-[1.75rem]">{title}</Heading>
            {subtitle ? <div className="mt-0.5 text-sm text-ink-soft sm:text-[0.9375rem]">{subtitle}</div> : null}
            {children}
          </div>
        </div>
        {script ? (
          <p aria-hidden className="absolute right-6 top-1/2 hidden max-w-52 -translate-y-1/2 -rotate-6 rounded-2xl bg-white/85 px-4 py-1.5 text-center font-script text-[1.35rem] font-bold leading-[0.95] text-forest-800 shadow-md backdrop-blur-sm xl:block">
            {script}
          </p>
        ) : null}
      </div>
    </section>
  );
}
