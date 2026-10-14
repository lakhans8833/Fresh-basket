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

/** Round brand mark: a woven basket of vegetables inside a green ring. Also used for the app icons. */
export function BasketMark({ className, ring = true }: { className?: string; ring?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      {ring ? <circle cx="60" cy="60" r="56" fill="#fff" stroke="#0b6623" strokeWidth="6" /> : null}
      <path d="M14 78c8-14 22-16 28-10-6 9-18 14-28 10Z" fill="#16a34a" />
      <path d="M106 78c-8-14-22-16-28-10 6 9 18 14 28 10Z" fill="#16a34a" />
      <circle cx="40" cy="48" r="11" fill="#2f9e44" />
      <circle cx="52" cy="40" r="11" fill="#37b24d" />
      <circle cx="80" cy="44" r="11" fill="#2f9e44" />
      <path d="M70 26 86 52l-6 3Z" fill="#f08c00" />
      <path d="M70 26c-2-6 2-10 2-10M70 26c-6-3-8 0-8 0M70 26c4-5 9-4 9-4" stroke="#2b8a3e" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M62 44c6-2 13 2 13 9s-4 10-9 10-10-4-9-10c0-5 2-8 5-9Z" fill="#fab005" />
      <path d="M66 43c0-3 2-5 4-5" stroke="#2b8a3e" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <circle cx="44" cy="58" r="10" fill="#e03131" />
      <circle cx="84" cy="60" r="8" fill="#e03131" />
      <path d="M40 49.5h8M44 48v4" stroke="#2b8a3e" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M26 62h68l-8 30H34Z" fill="#c07a2c" />
      <path d="M24 60h72a3 3 0 0 1 0 6H24a3 3 0 0 1 0-6Z" fill="#9a5b1c" />
      <path d="M31 74h58M33 82h54M44 66l3 26M60 66v26M76 66l-3 26" stroke="#8a4f17" strokeWidth="2" opacity=".75" />
    </svg>
  );
}

function splitName(name: string): [string, string | null] {
  const words = name.trim().split(/\s+/);
  if (words.length >= 3) return [words.slice(0, -2).join(" "), words.slice(-2).join(" ")];
  if (words.length === 2) return [words[0]!, words[1]!];
  return [name, null];
}

/** Brand lock-up. Uses the uploaded logo when configured, otherwise the mark + store name. */
export function Logo({
  name, logoUrl, tagline, tone = "dark", size = "md", className,
}: { name: string; logoUrl?: string | null; tagline?: string | null; tone?: "dark" | "light"; size?: "sm" | "md" | "lg"; className?: string }) {
  const [line1, line2] = splitName(name);
  const main = tone === "dark" ? "text-forest-800" : "text-white";
  const sub = tone === "dark" ? "text-forest-700" : "text-lime-200";
  const mark = { sm: "size-11", md: "size-12 sm:size-[4.25rem]", lg: "size-[4.5rem]" }[size];
  const l1 = { sm: "text-[1.2rem]", md: "text-[1.25rem] sm:text-[1.75rem]", lg: "text-[1.9rem]" }[size];
  const l2 = { sm: "text-[0.85rem]", md: "text-[0.9rem] sm:text-[1.2rem]", lg: "text-[1.3rem]" }[size];
  const tag = tagline?.replace(/\s*,\s*/g, " • ");
  return (
    <Link href="/" className={cn("inline-flex min-w-0 items-center gap-2 sm:gap-2.5", className)} aria-label={`${name} — home`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-configured logo of unknown size
        <img src={logoUrl} alt={name} className="h-12 w-auto sm:h-16" />
      ) : (
        <>
          <BasketMark className={cn(mark, "shrink-0 drop-shadow-sm")} />
          <span className="flex min-w-0 flex-col leading-none">
            <span className={cn("font-brand font-bold tracking-[-0.01em] whitespace-nowrap", l1, main)}>{line1}</span>
            {line2 ? (
              <span className={cn("mt-0.5 flex items-center gap-1.5 whitespace-nowrap font-brand font-bold", l2, main)}>
                <span aria-hidden className="hidden h-[2px] w-3 bg-current sm:block" />
                {line2}
                <span aria-hidden className="hidden h-[2px] w-3 bg-current sm:block" />
              </span>
            ) : null}
            {tag && size !== "sm" ? <span className={cn("mt-1 hidden whitespace-nowrap font-script text-[1.02rem] font-semibold sm:block", sub)}>{tag}</span> : null}
          </span>
        </>
      )}
    </Link>
  );
}
