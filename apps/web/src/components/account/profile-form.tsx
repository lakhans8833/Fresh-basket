"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { profileUpdateSchema, type Profile } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { useSession } from "./session-context";
import { Button } from "../ui/button";
import { Field, Input, focusFirstInvalid } from "../ui/form";
import { Notice } from "../ui/feedback";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = fullName !== (profile.fullName ?? "") || phone !== (profile.phone ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const input = { fullName, phone: phone.trim() ? phone : null };
    const parsed = profileUpdateSchema.safeParse(input);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        out[k] ??= k === "fullName" ? "Enter your name (at least 2 characters)" : i.message;
      }
      setErrors(out);
      focusFirstInvalid();
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const r = await api<{ profile: Profile }>("/api/me", { method: "PUT", json: parsed.data });
      setFullName(r.profile.fullName ?? "");
      setPhone(r.profile.phone ?? "");
      setStatus({ tone: "success", message: "Your profile has been saved." });
      await refresh();
      router.refresh();
    } catch (err) {
      setStatus({ tone: "error", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="profile-name" error={errors.fullName}>
          <Input
            id="profile-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? "profile-name-error" : undefined}
            maxLength={80}
          />
        </Field>
        <Field label="Mobile number" htmlFor="profile-phone" error={errors.phone} hint="10-digit Indian mobile, used for delivery updates">
          <Input
            id="profile-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            invalid={!!errors.phone}
            aria-describedby={errors.phone ? "profile-phone-error" : undefined}
            maxLength={16}
          />
        </Field>
        <Field label="Email" htmlFor="profile-email" hint="Your sign-in email can't be changed here" className="sm:col-span-2">
          <Input id="profile-email" type="email" value={profile.email ?? "Not available"} readOnly disabled />
        </Field>
      </div>
      {status ? <Notice tone={status.tone} className="mt-5">{status.message}</Notice> : null}
      <div className="mt-5 flex items-center gap-3">
        <Button type="submit" variant="dark" loading={saving} disabled={!dirty && !saving}>Save changes</Button>
        {dirty ? <span className="text-sm text-muted">Unsaved changes</span> : null}
      </div>
    </form>
  );
}
