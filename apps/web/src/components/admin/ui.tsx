"use client";

import { createContext, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus, type PaymentStatus } from "@freshbasket/shared";
import { cn } from "../ui/cn";
import { Button } from "../ui/button";
import { inputClass } from "../ui/form";
import { LeafMark } from "../layout/logo";
import { ProductImage } from "../product/product-image";
import { DiscardPrompt } from "./unsaved-guard";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold leading-tight text-ink md:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[0.9375rem] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-xl border border-line bg-white shadow-[0_1px_3px_rgb(20_48_31/0.05)]", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, id }: { title: string; description?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div>
        <h2 id={id} className="font-sans text-base font-bold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

type Tone = "neutral" | "green" | "lime" | "amber" | "red" | "dark";
const TONES: Record<Tone, string> = {
  neutral: "bg-sage-100 text-ink-soft",
  green: "bg-lime-100 text-forest-800",
  lime: "bg-lime-200 text-forest-900",
  amber: "bg-[#fdf6e7] text-[#7a5212]",
  red: "bg-danger-bg text-danger",
  dark: "bg-forest-800 text-white",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}

export function orderTone(s: OrderStatus): Tone {
  return s === "cancelled" ? "red" : s === "delivered" ? "green" : s === "pending_payment" || s === "pending_confirmation" ? "amber" : s === "out_for_delivery" ? "dark" : s === "packed" ? "lime" : "neutral";
}
export function paymentTone(s: PaymentStatus): Tone {
  return s === "paid" || s === "cod_collected" ? "green" : s === "refund_pending" || s === "failed" ? "red" : s === "pending" ? "amber" : "neutral";
}
/** Order still "placed" after its delivery slot ended. */
export function LateBadge() {
  return (
    <Badge tone="red" className="uppercase tracking-wide">
      <span title="Delivery slot has ended and the order isn't delivered yet">Late</span>
    </Badge>
  );
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTone(status)}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={paymentTone(status)} className="font-medium">{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

/** Accessible on/off switch (a real checkbox with role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-[0.8125rem] text-muted">{description}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={inputId} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden className="h-6 w-11 rounded-full bg-sage-200 transition-colors peer-checked:bg-leaf-600 peer-focus-visible:outline-[2.5px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-leaf-500 peer-focus-visible:outline" />
        <span aria-hidden className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Rupee input: staff type rupees, we convert to paise on submit. */
export function MoneyInput({ className, invalid, ...rest }: Omit<ComponentProps<"input">, "type"> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[0.9375rem] text-muted">₹</span>
      <input type="text" inputMode="decimal" autoComplete="off" className={cn(inputClass, "pl-7 tabular-nums", className)} aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
}

export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14 w-full" />
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-[var(--radius-card)] border border-danger/20 bg-danger-bg px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-danger" aria-hidden />
      <p className="mt-3 font-semibold text-danger">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-md text-sm text-danger/90">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Modal confirm dialog built on <dialog> (focus trap + Esc for free). */
export function ConfirmDialog({
  open, title, children, confirmLabel = "Confirm", tone = "primary", busy, onConfirm, onClose,
}: { open: boolean; title: string; children?: ReactNode; confirmLabel?: string; tone?: "primary" | "danger"; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      // Repeated Escape can close it natively: keep the page's state in step (re-open while busy).
      onClose={() => {
        const d = ref.current;
        if (open && d && !d.open) {
          if (busy) d.showModal();
          else onClose();
        }
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-white p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-forest-950/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <h2 id={titleId} className="text-xl font-semibold text-forest-900">{title}</h2>
        {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Keep as is</Button>
          <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={busy} autoFocus>{confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  );
}

/** Generic "slide-over"-ish editor panel rendered as a modal dialog for create/edit forms. */
/** Lets a form inside an EditorDialog report "saving…" so the dialog can't be closed meanwhile. */
const EditorDialogCtx = createContext<{ setBusy: (b: boolean) => void; markDirty: () => void } | null>(null);
export function useEditorDialogBusy(busy: boolean) {
  const ctx = useContext(EditorDialogCtx);
  useEffect(() => {
    ctx?.setBusy(busy);
  }, [ctx, busy]);
}
/** For edits that aren't typing into a field (chips, "Remove image" buttons): count as unsaved. */
export function useEditorDialogMarkDirty(): () => void {
  return useContext(EditorDialogCtx)?.markDirty ?? (() => {});
}

export interface EditorDialogHandle {
  /** Close like Escape / Cancel: asks first when the form has unsaved edits, never while saving. */
  requestClose: () => void;
}

/**
 * Modal editor. Any typing/choosing inside marks it as edited; Escape, the Cancel button (via
 * controlRef.requestClose) and the backdrop then ask "Discard your changes?" instead of silently
 * losing the draft. While the form reports it is saving (useEditorDialogBusy) it can't be closed.
 * A successful save closes it by setting `open` to false (no prompt).
 */
export function EditorDialog({
  open, title, onClose, children, busy, wide, controlRef,
}: { open: boolean; title: string; onClose: () => void; children: ReactNode; busy?: boolean; wide?: boolean; controlRef?: Ref<EditorDialogHandle> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [childBusy, setChildBusy] = useState(false);
  const isBusy = Boolean(busy) || childBusy;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // A fresh start each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setDirty(false);
      setConfirming(false);
      setChildBusy(false);
    }
  }
  const requestClose = () => {
    if (isBusy) return;
    if (dirty) setConfirming(true);
    else onClose();
  };
  useImperativeHandle(controlRef, () => ({ requestClose }));
  const ctx = useMemo(() => ({ setBusy: setChildBusy, markDirty: () => setDirty(true) }), []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      // A repeated Escape can make the browser close the modal even though cancel was prevented.
      // While the page still wants it open, put it back (draft and prompt intact).
      onClose={() => {
        const d = ref.current;
        if (open && d && !d.open) {
          d.showModal();
          if (dirty) setConfirming(true);
        }
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] rounded-[var(--radius-card)] border border-line bg-ivory p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-forest-950/40 backdrop:backdrop-blur-[2px]",
        wide ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]",
      )}
    >
      {open ? (
        <EditorDialogCtx.Provider value={ctx}>
          <div className="p-5 sm:p-6" onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <h2 id={titleId} className="text-xl font-semibold text-forest-900">{title}</h2>
            {confirming && !isBusy ? <DiscardPrompt onKeep={() => setConfirming(false)} onDiscard={() => { setConfirming(false); onClose(); }} /> : null}
            <div className="mt-4">{children}</div>
          </div>
        </EditorDialogCtx.Provider>
      ) : null}
    </dialog>
  );
}

export function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-sage-50 px-3 py-2">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}
export function formatDay(d: string) {
  return new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Small square product thumbnail with a compact placeholder (ProductImage's placeholder is sized for cards). */
export function Thumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div role="img" aria-label={`${alt} — no photo yet`} className={cn("grid place-items-center bg-gradient-to-br from-sage-100 to-lime-50 text-forest-700/40", className)}>
        <LeafMark className="size-1/2" />
      </div>
    );
  }
  return <ProductImage src={src} alt={alt} sizes="96px" className={className} />;
}
