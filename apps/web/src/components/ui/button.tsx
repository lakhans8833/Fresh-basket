import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./feedback";

type Variant = "primary" | "dark" | "lime" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,box-shadow,transform,color] duration-150 active:translate-y-px disabled:opacity-55 disabled:pointer-events-none select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-leaf-600 text-white hover:bg-forest-600 shadow-[0_6px_16px_-8px_rgb(47_106_55/0.7)]",
  dark: "bg-forest-800 text-white hover:bg-forest-900",
  lime: "bg-lime-200 text-forest-900 hover:bg-lime-300",
  outline: "border border-line bg-white text-forest-900 hover:border-forest-700/40 hover:bg-sage-50",
  ghost: "text-forest-800 hover:bg-sage-100",
  danger: "border border-danger/25 bg-white text-danger hover:bg-danger-bg",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary", size = "md", loading, className, children, disabled, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href, variant = "primary", size = "md", className, children, ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
