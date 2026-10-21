"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useSession } from "./session-context";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";

/**
 * "Delete my account" (Google Play requires self-service deletion for apps with accounts).
 * Two steps: open the panel, then type DELETE — so it can't happen with a stray tap.
 */
export function DeleteAccount() {
  const router = useRouter();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (typed.trim().toUpperCase() !== "DELETE" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/me", { method: "DELETE", json: { confirm: "DELETE" } });
      await logout().catch(() => undefined);
      router.replace("/?account=deleted");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delete-account-heading" className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-7">
      <h2 id="delete-account-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Trash2 className="size-5 text-danger" aria-hidden /> Delete account
      </h2>
      <p className="mt-1 text-sm text-muted">
        Removes your login, profile, saved addresses and reviews. Past orders stay in the store&apos;s records (needed for accounts) but are no
        longer linked to you. This can&apos;t be undone.
      </p>
      {!open ? (
        <Button type="button" variant="outline" className="mt-4 border-danger/40 text-danger hover:bg-danger/5" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field label='Type DELETE to confirm' htmlFor="delete-confirm">
            <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" loading={busy} disabled={typed.trim().toUpperCase() !== "DELETE" || busy}>
              Permanently delete my account
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setTyped(""); setError(null); }}>
              Keep my account
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
