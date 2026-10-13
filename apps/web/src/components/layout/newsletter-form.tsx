"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "../ui/feedback";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      await api("/api/newsletter", { method: "POST", json: { email } });
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-full bg-white px-5 py-3.5 text-[0.9375rem] font-medium text-forest-800">
        <Check className="size-5 text-leaf-600" aria-hidden /> You&apos;re subscribed. Thank you!
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex gap-2 rounded-full bg-white p-1.5 shadow-sm ring-1 ring-forest-900/5 focus-within:ring-4 focus-within:ring-leaf-500/30">
        <label htmlFor="nl-email" className="sr-only">Email address</label>
        <input
          id="nl-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className="min-w-0 flex-1 rounded-full bg-transparent px-4 text-[0.9375rem] text-ink placeholder:text-muted/80 focus:outline-none"
          aria-invalid={state === "error" || undefined}
          aria-describedby={state === "error" ? "nl-error" : undefined}
        />
        <button type="submit" disabled={state === "loading"} className="inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60">
          {state === "loading" ? <Spinner className="size-4" /> : null}
          Subscribe <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      {state === "error" ? <p id="nl-error" className="mt-2 pl-4 text-sm text-danger">{error}</p> : null}
    </form>
  );
}
