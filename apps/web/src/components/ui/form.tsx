import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[0.9375rem] text-ink placeholder:text-muted/70 transition-colors focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-lime-200/70 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:ring-danger/10 disabled:bg-sage-50";

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input className={cn(inputClass, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-28 py-2.5", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2366715f%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%2366715f%22 stroke-width=%221.6%22 fill=%22none%22/></svg>')] bg-[length:18px] bg-[right_12px_center] bg-no-repeat pr-10", className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...rest }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft", className)}>
      <input type="checkbox" className="size-4.5 rounded border-line accent-leaf-600" {...rest} />
      {label}
    </label>
  );
}
