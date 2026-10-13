import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "./cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className ?? "size-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "error"; title?: string; children?: ReactNode; className?: string }) {
  const tones = {
    info: "bg-sage-50 border-sage-200 text-ink-soft",
    success: "bg-lime-50 border-lime-300 text-forest-800",
    warning: "bg-[#fdf6e7] border-[#f0d9a6] text-[#7a5212]",
    error: "bg-danger-bg border-danger/20 text-danger",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-sm", tones, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-sage-200 bg-white/60 px-6 py-14 text-center">
      {icon ? <div className="mb-4 grid size-16 place-items-center rounded-full bg-lime-100 text-forest-700">{icon}</div> : null}
      <h2 className="text-2xl font-semibold text-forest-900">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-[0.9375rem] text-muted">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function DevBadge({ children = "Development mode", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-[#f0d9a6] bg-[#fdf6e7] px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[#7a5212]", className)}>
      {children}
    </span>
  );
}
