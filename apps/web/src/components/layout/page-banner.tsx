import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

/** Green-tinted page header with vegetable photography on the right (mockup style). */
export function PageBanner({
  title, subtitle, icon, image = "/images/dev/banner-basket.jpg", script, children, className, as: Heading = "h1",
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
      <div className="container-page relative flex min-h-[7.5rem] items-center py-6 md:min-h-[8.5rem]">
        <div className="relative z-10 flex min-w-0 items-center gap-4 md:max-w-[52%]">
          {icon ? <span className="hidden shrink-0 text-forest-800 sm:block">{icon}</span> : null}
          <div className="min-w-0">
            <Heading className="text-[1.75rem] font-bold leading-tight text-forest-800 sm:text-[2.25rem] md:text-[2.5rem]">{title}</Heading>
            {subtitle ? <div className="mt-1 text-[0.9375rem] text-ink-soft sm:text-lg">{subtitle}</div> : null}
            {children}
          </div>
        </div>
        {script ? (
          <p aria-hidden className="absolute right-6 top-1/2 hidden max-w-52 -translate-y-1/2 -rotate-6 rounded-2xl bg-white/85 px-4 py-2 text-center font-script text-[1.6rem] font-bold leading-[0.95] text-forest-800 shadow-md backdrop-blur-sm xl:block">
            {script}
          </p>
        ) : null}
      </div>
    </section>
  );
}
