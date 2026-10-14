"use client";

import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { contactSchema, isValidIndianMobile } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/form";
import { Notice } from "../ui/feedback";

type Draft = { name: string; email: string; phone: string; orderNumber: string; message: string };

export function ContactForm({ initial }: { initial: Omit<Draft, "message"> }) {
  const [d, setD] = useState<Draft>({ ...initial, message: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const described = (k: keyof Draft) => (errors[k] ? `contact-${k}-error` : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { name: d.name, email: d.email.trim(), phone: d.phone.trim() || null, orderNumber: d.orderNumber.trim() || null, message: d.message };
    const errs: Partial<Record<keyof Draft, string>> = {};
    const r = contactSchema.safeParse(input);
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0]) as keyof Draft] ??= i.message;
    if (input.phone && !isValidIndianMobile(input.phone)) errs.phone = "Enter a valid 10-digit mobile number, or leave it blank";
    setErrors(errs);
    if (Object.keys(errs).length || !r.success) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setSending(true);
    try {
      await api("/api/contact", { method: "POST", json: r.data });
      setSent(true);
      requestAnimationFrame(() => doneRef.current?.focus());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="mt-6 flex flex-col items-start gap-3 rounded-2xl bg-lime-50 p-6 focus:outline-none">
        <CheckCircle2 className="size-8 text-leaf-600" aria-hidden />
        <h3 className="text-xl font-semibold text-forest-900">Thanks — your message has been sent</h3>
        <p className="text-[0.9375rem] text-ink-soft">We&apos;ll reply to <span className="font-medium text-ink">{d.email}</span> as soon as we can.</p>
        <Button variant="outline" size="sm" onClick={() => { setSent(false); setD({ ...d, message: "", orderNumber: "" }); }}>Send another message</Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="mt-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="contact-name" error={errors.name}>
          <Input id="contact-name" autoComplete="name" value={d.name} onChange={set("name")} invalid={!!errors.name} aria-describedby={described("name")} maxLength={80} required />
        </Field>
        <Field label="Email" htmlFor="contact-email" error={errors.email}>
          <Input id="contact-email" type="email" autoComplete="email" value={d.email} onChange={set("email")} invalid={!!errors.email} aria-describedby={described("email")} maxLength={160} required />
        </Field>
        <Field label="Mobile number (optional)" htmlFor="contact-phone" error={errors.phone}>
          <Input id="contact-phone" type="tel" inputMode="tel" autoComplete="tel-national" value={d.phone} onChange={set("phone")} invalid={!!errors.phone} aria-describedby={described("phone")} maxLength={16} />
        </Field>
        <Field label="Order number (optional)" htmlFor="contact-order" error={errors.orderNumber} hint="If your message is about an order">
          <Input id="contact-order" value={d.orderNumber} onChange={set("orderNumber")} invalid={!!errors.orderNumber} aria-describedby={described("orderNumber")} maxLength={40} />
        </Field>
        <Field label="Message" htmlFor="contact-message" error={errors.message} hint={`${d.message.trim().length}/2000`} className="sm:col-span-2">
          <Textarea id="contact-message" rows={6} value={d.message} onChange={set("message")} aria-invalid={!!errors.message || undefined} aria-describedby={described("message")} maxLength={2000} required />
        </Field>
      </div>
      {error ? <Notice tone="error" className="mt-5">{error}</Notice> : null}
      <Button type="submit" variant="dark" className="mt-6" loading={sending}>
        {!sending ? <Send className="size-4" aria-hidden /> : null} Send message
      </Button>
    </form>
  );
}
