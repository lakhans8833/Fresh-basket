"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, MailCheck, Search, Send, Users } from "lucide-react";
import type { Profile } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { useSession } from "../account/session-context";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { Badge, ConfirmDialog, LoadError, LoadingRows, PageHeader, formatDateTime } from "./ui";

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
        description="Everyone who has signed up. Give store staff the Staff role (orders and inventory) or Admin (everything)."
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
                    <p className="truncate font-semibold text-ink">{u.fullName || "—"}{self ? <span className="ml-1.5 text-xs font-medium text-muted">(you)</span> : null}</p>
                    <p className="truncate text-sm text-muted">{u.email ?? "no email"}{u.phone ? ` · ${u.phone}` : ""}</p>
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
