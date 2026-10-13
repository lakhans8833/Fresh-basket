import Link from "next/link";
import { cn } from "../ui/cn";

export function LeafMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M33.5 5.5C20 5 8.8 11.5 7 23.4c-.6 4 .3 7.6 2.1 10.1C10.6 25.7 16 18.7 24.6 14c-7 5.3-11.3 11.3-13.3 19.7 2.3 1.2 5.3 1.7 8.6 1.1C31.8 32.6 35.4 18.8 33.5 5.5Z" fill="currentColor" />
      <path d="M11.4 33.6c2-8.3 6.3-14.3 13.2-19.6" stroke="#fbf9f3" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".55" />
    </svg>
  );
}

/** Brand lock-up. Uses the uploaded logo when configured, otherwise the store name. */
export function Logo({ name, logoUrl, tone = "dark", size = "md", className }: { name: string; logoUrl?: string | null; tone?: "dark" | "light"; size?: "sm" | "md" | "lg"; className?: string }) {
  const words = name.trim().split(/\s+/);
  const stacked = words.length === 2;
  const text = tone === "dark" ? "text-forest-900" : "text-ivory";
  const leaf = tone === "dark" ? "text-leaf-500" : "text-lime-300";
  const sz = { sm: "text-[1.05rem]", md: "text-[1.35rem]", lg: "text-[1.75rem]" }[size];
  const mark = { sm: "size-6", md: "size-8", lg: "size-10" }[size];
  return (
    <Link href="/" className={cn("inline-flex items-center gap-1.5", className)} aria-label={`${name} — home`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-configured logo of unknown size
        <img src={logoUrl} alt={name} className="h-10 w-auto" />
      ) : (
        <>
          <LeafMark className={cn(mark, leaf, "-mr-0.5 shrink-0")} />
          <span className={cn("font-display font-semibold leading-[0.82] tracking-[-0.03em] lowercase", sz, text)}>
            {stacked ? (
              <>
                <span className="block">{words[0]}</span>
                <span className="block">{words[1]}.</span>
              </>
            ) : (
              <>{name}.</>
            )}
          </span>
        </>
      )}
    </Link>
  );
}
