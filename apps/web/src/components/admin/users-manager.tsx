"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, KeyRound, Link2, MailCheck, Pencil, Search, Send, Users } from "lucide-react";
import type { Profile } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { useSession } from "../account/session-context";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { Badge, ConfirmDialog, EditorDialog, LoadError, LoadingRows, PageHeader, formatDateTime, useEditorDialogBusy, useEditorDialogMarkDirty } from "./ui";

interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Profile["role"];
  createdAt: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  orders: number;
}

const ROLES: { value: Profile["role"]; label: string; hint: string }[] = [
  { value: "customer", label: "Customer", hint: "Shops and sees their own orders" },
  { value: "staff", label: "Staff", hint: "Orders and inventory in Admin" },
  { value: "admin", label: "Admin", hint: "Everything, including settings and users" },
];

export function UsersManager() {
  return (
    <AdminOnly>
      <Inner />
    </AdminOnly>
  );
}

function Inner() {
  const toast = useToast();
  const { profile: me } = useSession();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload, setData } = useAdminData<{ users: AdminUser[] }>(`/api/admin/users${dq ? `?q=${encodeURIComponent(dq)}` : ""}`);
  const [saving, setSaving] = useState<string | null>(null);
  const [promote, setPromote] = useState<AdminUser | null>(null);
  const [confirmFor, setConfirmFor] = useState<AdminUser | null>(null);
  const [emailBusy, setEmailBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const users = data?.users ?? [];

  async function setRole(u: AdminUser, role: Profile["role"]) {
    setSaving(u.id);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { role } });
      setData((d) => (d ? { users: d.users.map((x) => (x.id === u.id ? { ...x, role } : x)) } : d));
      toast(`${u.fullName || u.email || "User"} is now ${role}`);
    } catch (e) {
      toast(errorMessage(e));
      await reload();
    } finally {
      setSaving(null);
    }
  }

  async function confirmEmail(u: AdminUser) {
    setEmailBusy(`confirm:${u.id}`);
    try {
      const r = await api<{ emailConfirmedAt: string }>(`/api/admin/users/${u.id}`, { method: "POST", json: { action: "confirm-email" } });
      setData((d) => (d ? { users: d.users.map((x) => (x.id === u.id ? { ...x, emailConfirmedAt: r.emailConfirmedAt } : x)) } : d));
      toast(`${u.email ?? "Email"} is now confirmed — they can sign in.`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setEmailBusy(null);
    }
  }

  async function resendEmail(u: AdminUser) {
    setEmailBusy(`resend:${u.id}`);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "POST", json: { action: "resend-confirmation" } });
      toast(`Confirmation email sent to ${u.email}.`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setEmailBusy(null);
    }
  }

  const confirmed = users.filter((u) => u.emailConfirmedAt).length;

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who has signed up. Use Edit details to change a name, mobile or sign-in email. Give store staff the Staff role (orders and inventory) or Admin (everything)."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="user-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or mobile" className="pl-10" />
        </div>
        {data ? <p className="text-sm text-muted">{users.length} {users.length === 1 ? "user" : "users"} · {confirmed} email confirmed</p> : null}
      </div>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={6} />
      ) : users.length === 0 ? (
        <EmptyState icon={<Users className="size-7" aria-hidden />} title={dq ? "No matching users" : "No users yet"}>
          {dq ? `Nothing matches “${dq}”.` : "People appear here after they create an account."}
        </EmptyState>
      ) : (
        <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_11rem] gap-4 border-b border-line bg-sage-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted lg:grid">
            <span>User</span><span>Email</span><span>Joined · last sign-in</span><span className="text-right">Orders</span><span>Role</span>
          </div>
          <ul className="divide-y divide-line">
            {users.map((u) => {
              const self = me?.id === u.id;
              return (
                <li key={u.id} className="grid grid-cols-1 gap-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_11rem] lg:items-center lg:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{u.fullName || "—"}{self ? <span className="ml-1.5 text-xs font-medium text-muted">(you)</span> : null}</p>
                        <p className="truncate text-sm text-muted">{u.email ?? "no email"}{u.phone ? ` · ${u.phone}` : ""}</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 px-3 text-xs font-semibold" aria-label={`Edit ${u.fullName || u.email || "user"}`} title="Edit name, mobile or email" onClick={() => setEditing(u)}>
                        <Pencil className="size-3.5" aria-hidden /> Edit details
                      </Button>
                    </div>
                  </div>
                  <div>
                    {u.emailConfirmedAt ? (
                      <Badge tone="green"><CheckCircle2 className="size-3.5" aria-hidden /> Confirmed</Badge>
                    ) : (
                      <>
                        <Badge tone="amber"><CircleAlert className="size-3.5" aria-hidden /> Not confirmed</Badge>
                        {u.email ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              disabled={emailBusy !== null}
                              aria-label={`Confirm email for ${u.email}`}
                              onClick={() => setConfirmFor(u)}
                            >
                              <MailCheck className="size-3.5" aria-hidden /> Confirm email
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2.5 text-xs"
                              disabled={emailBusy !== null}
                              aria-label={`Resend confirmation email to ${u.email}`}
                              onClick={() => void resendEmail(u)}
                            >
                              <Send className="size-3.5" aria-hidden /> {emailBusy === `resend:${u.id}` ? "Sending…" : "Resend email"}
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted">
                    {u.createdAt ? formatDateTime(u.createdAt) : "—"}
                    <span className="block text-xs">{u.lastSignInAt ? `Last sign-in ${formatDateTime(u.lastSignInAt)}` : "Never signed in"}</span>
                  </p>
                  <p className="text-sm tabular-nums text-ink lg:text-right"><span className="lg:hidden text-muted">Orders: </span>{u.orders}</p>
                  <div>
                    <label htmlFor={`role-${u.id}`} className="sr-only">Role for {u.fullName || u.email}</label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={self || saving === u.id}
                      title={self ? "You can't change your own role" : undefined}
                      onChange={(e) => {
                        const role = e.target.value as Profile["role"];
                        if (role === "admin") setPromote(u);
                        else void setRole(u, role);
                      }}
                      className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-lime-200/70 disabled:bg-sage-50 disabled:text-muted"
                    >
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ul className="mt-4 space-y-1 text-xs text-muted">
        {ROLES.map((r) => <li key={r.value}><b className="text-ink-soft">{r.label}:</b> {r.hint}</li>)}
      </ul>

      <EditorDialog open={editing !== null} title={`Edit ${editing?.fullName || editing?.email || "user"}`} onClose={() => setEditing(null)}>
        {editing ? (
          <EditUserForm
            user={editing}
            self={me?.id === editing.id}
            onCancel={() => setEditing(null)}
            onSaved={(next) => {
              setData((d) => (d ? { users: d.users.map((x) => (x.id === next.id ? { ...x, ...next } : x)) } : d));
              toast(`Saved ${next.fullName || next.email}`);
              setEditing(null);
            }}
          />
        ) : null}
      </EditorDialog>

      <ConfirmDialog
        open={promote !== null}
        title={`Make ${promote?.fullName || promote?.email || "this user"} an admin?`}
        confirmLabel="Make admin"
        busy={saving === promote?.id}
        onConfirm={async () => {
          if (promote) await setRole(promote, "admin");
          setPromote(null);
        }}
        onClose={() => setPromote(null)}
      >
        Admins can change prices, settings, coupons and other users&apos; roles. Only give this to people who run the store.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmFor !== null}
        title={`Confirm ${confirmFor?.email ?? "this email"}?`}
        confirmLabel="Confirm email"
        busy={emailBusy === `confirm:${confirmFor?.id}`}
        onConfirm={async () => {
          if (confirmFor) await confirmEmail(confirmFor);
          setConfirmFor(null);
        }}
        onClose={() => setConfirmFor(null)}
      >
        Only do this if you know this address belongs to the customer (for example, they called the store). They can then sign in without clicking the email link.
      </ConfirmDialog>
    </>
  );
}

/** Name, mobile and sign-in email. Changing the email changes how this person signs in. */
function EditUserForm({ user, self, onCancel, onSaved }: {
  user: AdminUser; self: boolean; onCancel: () => void;
  onSaved: (u: Pick<AdminUser, "id" | "email" | "fullName" | "phone" | "emailConfirmedAt">) => void;
}) {
  const markDirty = useEditorDialogMarkDirty();
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEditorDialogBusy(saving);
  const emailChanged = email.trim().toLowerCase() !== (user.email ?? "").toLowerCase();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ user: Pick<AdminUser, "id" | "email" | "fullName" | "phone" | "emailConfirmedAt"> }>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        json: { fullName, phone: phone.trim() ? phone : null, email: email.trim() },
      });
      onSaved(r.user);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const change = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.value); markDirty(); };
  return (
    <div className="space-y-6">
    <form onSubmit={save} className="space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Field label="Name" htmlFor="eu-name"><Input id="eu-name" value={fullName} onChange={change(setFullName)} required minLength={2} maxLength={80} /></Field>
      <Field label="Mobile number" htmlFor="eu-phone" hint="10-digit Indian mobile (optional)"><Input id="eu-phone" inputMode="tel" value={phone} onChange={change(setPhone)} maxLength={16} /></Field>
      <Field label="Email (used to sign in)" htmlFor="eu-email"><Input id="eu-email" type="email" value={email} onChange={change(setEmail)} required maxLength={160} autoComplete="off" /></Field>
      {emailChanged ? (
        <Notice tone="warning">
          {self ? "You" : "They"} will sign in with <b>{email.trim() || "the new email"}</b> from now on. The new address is marked as confirmed, so only change it when you know it
          belongs to {self ? "you" : "this person"}. Their password stays the same.
        </Notice>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="dark" loading={saving}>Save</Button>
      </div>
    </form>
    <PasswordTools user={user} self={self} />
    </div>
  );
}

/**
 * Password help for someone who can't sign in: a one-time reset link (works on any phone; send it on
 * WhatsApp or copy it) or setting a new password directly. Never shown for your own account.
 */
function PasswordTools({ user, self }: { user: AdminUser; self: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"link" | "set" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [setting, setSetting] = useState(false);
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);

  if (self) {
    return (
      <section className="border-t border-line pt-4 text-sm text-muted">
        <h3 className="flex items-center gap-2 font-semibold text-ink"><KeyRound className="size-4" aria-hidden /> Password</h3>
        <p className="mt-1">To change your own password, go to Your account → Profile → Change password.</p>
      </section>
    );
  }

  async function makeLink() {
    setBusy("link"); setError(null);
    try {
      const r = await api<{ link: string }>(`/api/admin/users/${user.id}`, { method: "POST", json: { action: "reset-link" } });
      setLink(r.link);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("set"); setError(null);
    try {
      await api(`/api/admin/users/${user.id}`, { method: "POST", json: { action: "set-password", password: pw } });
      setDone(true); setSetting(false); setPw("");
      toast(`New password set for ${user.fullName || user.email}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }
  const digits = (user.phone ?? "").replace(/\D/g, "").slice(-10);
  const waHref = link && digits.length === 10
    ? `https://wa.me/91${digits}?text=${encodeURIComponent(`Hi ${user.fullName ?? ""}, use this link to set a new password for your account (works once, for about 1 hour): ${link}`)}`
    : null;

  return (
    // Typing a password here isn't an unsaved edit of the details form above (no "Discard changes?" on close).
    <section className="space-y-3 border-t border-line pt-4" aria-labelledby={`pw-${user.id}`} onInput={(e) => e.stopPropagation()} onChange={(e) => e.stopPropagation()}>
      <h3 id={`pw-${user.id}`} className="flex items-center gap-2 text-sm font-semibold text-ink"><KeyRound className="size-4" aria-hidden /> Password</h3>
      <p className="text-sm text-muted">For someone who forgot their password. A reset link is safest — they choose the new password themselves.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="success">Password changed. Tell {user.fullName || "them"} the new password — they were signed out on all devices.</Notice> : null}
      {link ? (
        <div className="space-y-2">
          <label htmlFor={`link-${user.id}`} className="text-xs font-medium text-ink-soft">Reset link (works once, for about 1 hour)</label>
          <Input id={`link-${user.id}`} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Link copied"), () => toast("Copy failed — select the link and copy it"))}>
              <Copy className="size-3.5" aria-hidden /> Copy link
            </Button>
            {waHref ? (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-whatsapp px-3 text-sm font-semibold text-white hover:opacity-90">
                Send on WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {setting ? (
        <form onSubmit={savePassword} className="space-y-2">
          <Field label="New password" htmlFor={`newpw-${user.id}`} hint="At least 8 characters. Tell the person in person or on a call — not in a group chat.">
            <Input id={`newpw-${user.id}`} type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} maxLength={72} required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="dark" loading={busy === "set"} disabled={pw.length < 8}>Set password</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setSetting(false); setPw(""); }} disabled={busy !== null}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" loading={busy === "link"} disabled={busy !== null} onClick={() => void makeLink()}>
            <Link2 className="size-3.5" aria-hidden /> {link ? "New reset link" : "Create reset link"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setSetting(true); setDone(false); }}>
            <KeyRound className="size-3.5" aria-hidden /> Set new password
          </Button>
        </div>
      )}
    </section>
  );
}
