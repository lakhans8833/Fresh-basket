"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/button";

/**
 * Protects an admin page with unsaved edits (Settings, product form, Inventory):
 * - closing / reloading the tab → the browser's own "Leave site?" prompt;
 * - clicking any link inside the app (sidebar, breadcrumbs, header) → a dialog with
 *   Save / Discard / Stay. Save runs the page's own save and only leaves if it succeeded.
 * After a successful save the page is no longer dirty, so no warning appears.
 */
const LEAVE_EVENT = "fb:request-leave";

/**
 * For actions that leave the page without a link (e.g. Sign out): asks every mounted guard first.
 * `proceed` runs right away when nothing is unsaved, or after the admin chooses Save/Discard.
 */
export function requestLeave(proceed: () => void) {
  const ev = new CustomEvent(LEAVE_EVENT, { cancelable: true, detail: { proceed } });
  if (window.dispatchEvent(ev)) proceed();
}

export function useUnsavedGuard({ dirty, save, saving }: { dirty: boolean; save?: () => Promise<boolean>; saving?: boolean }) {
  const router = useRouter();
  // Where the admin wanted to go: a page (link) or an action (sign out).
  const [pending, setPending] = useState<{ href: string } | { run: () => void } | null>(null);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Capture phase: runs before Next's <Link> handler, so the navigation can be held back.
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page with another filter / #hash: the page (and the edits) stay mounted — nothing is lost.
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ href: `${url.pathname}${url.search}${url.hash}` });
    };
    const onLeaveRequest = (e: Event) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      setPending({ run: (e as CustomEvent<{ proceed: () => void }>).detail.proceed });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener(LEAVE_EVENT, onLeaveRequest);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(LEAVE_EVENT, onLeaveRequest);
    };
  }, [dirty]);

  const leave = (to: { href: string } | { run: () => void }) => {
    dirtyRef.current = false;
    setPending(null);
    if ("href" in to) router.push(to.href);
    else to.run();
  };

  const dialog = (
    <LeaveDialog
      open={pending !== null}
      saving={Boolean(saving)}
      canSave={Boolean(save)}
      onStay={() => setPending(null)}
      onDiscard={() => pending && leave(pending)}
      onSave={async () => {
        if (!save || !pending) return;
        const to = pending;
        if (await save()) leave(to);
        else setPending(null); // save failed: stay and show the form's errors
      }}
    />
  );
  return { dialog };
}

function LeaveDialog({
  open, saving, canSave, onStay, onDiscard, onSave,
}: { open: boolean; saving: boolean; canSave: boolean; onStay: () => void; onDiscard: () => void; onSave: () => void }) {
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
        if (!saving) onStay();
      }}
      // Browsers may close a modal on a repeated Escape even when cancel is prevented: keep it in step.
      onClose={() => { if (open && !ref.current?.open) onStay(); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-ivory p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-forest-950/40"
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <h2 id={titleId} className="text-xl font-semibold text-forest-900">You have unsaved changes</h2>
          <p className="mt-2 text-sm text-ink-soft">Save them before leaving this page, or discard them.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onStay} disabled={saving} autoFocus>Stay</Button>
            <Button type="button" variant="outline" onClick={onDiscard} disabled={saving}>Discard</Button>
            {canSave ? <Button type="button" variant="dark" onClick={onSave} loading={saving}>Save and leave</Button> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Confirmation shown INSIDE an editor dialog when it's closed with unsaved edits. */
export function DiscardPrompt({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }): ReactNode {
  return (
    <div role="alertdialog" aria-label="Discard changes?" className="mt-4 rounded-xl border border-[#e9cf96] bg-[#fdf6e7] p-4">
      <p className="font-semibold text-ink">Discard your changes?</p>
      <p className="mt-0.5 text-sm text-ink-soft">What you typed in this form hasn&apos;t been saved.</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="dark" onClick={onKeep} autoFocus>Keep editing</Button>
        <Button type="button" size="sm" variant="outline" onClick={onDiscard}>Discard</Button>
      </div>
    </div>
  );
}
