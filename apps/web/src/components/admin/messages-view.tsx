"use client";

import Link from "next/link";
import { useState } from "react";
import { Inbox, Mail, Phone, CheckCircle2, RotateCcw, Users } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, useAdminData } from "./use-admin-data";
import { Badge, Card, LoadError, LoadingRows, PageHeader, formatDateTime, timeAgo } from "./ui";

interface Msg {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  orderNumber: string | null;
  message: string;
  status: "open" | "closed";
  createdAt: string;
}

export function MessagesView() {
  const toast = useToast();
  const { data, setData, error, reload } = useAdminData<{ messages: Msg[]; subscribers: number }>("/api/admin/messages");
  const [tab, setTab] = useState<"open" | "closed" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const messages = data?.messages ?? [];
  const shown = messages.filter((m) => tab === "all" || m.status === tab);
  const openCount = messages.filter((m) => m.status === "open").length;

  async function setStatus(m: Msg, status: Msg["status"]) {
    setBusy(m.id);
    try {
      await api(`/api/admin/messages/${m.id}`, { method: "PATCH", json: { status } });
      setData((d) => (d ? { ...d, messages: d.messages.map((x) => (x.id === m.id ? { ...x, status } : x)) } : d));
      toast(status === "closed" ? "Marked as resolved" : "Reopened");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Messages" description="Questions sent through the contact form. Reply by email or phone, then mark them resolved." />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div role="tablist" aria-label="Message status" className="inline-flex w-fit gap-1 rounded-full border border-line bg-white p-1">
          {([["open", `Open${data ? ` · ${openCount}` : ""}`], ["closed", "Resolved"], ["all", "All"]] as const).map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", tab === v ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-sage-100")}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-[var(--shadow-card)]">
          <span className="grid size-9 place-items-center rounded-full bg-lime-100 text-forest-700"><Users className="size-4" aria-hidden /></span>
          <div>
            <p className="text-xs text-muted">Newsletter subscribers</p>
            <p className="font-display text-xl font-semibold leading-none tabular-nums text-forest-900">{data ? data.subscribers : "—"}</p>
          </div>
        </div>
      </div>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={4} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Inbox className="size-7" aria-hidden />} title={tab === "open" ? "Inbox zero" : "No messages here"}>
          {tab === "open" ? "No open messages. New contact-form messages will appear here." : "Nothing to show."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {shown.map((m) => (
            <li key={m.id}>
              <Card className={cn("p-5", m.status === "closed" && "bg-sage-50/60")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-forest-900">{m.name}</p>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-leaf-600 hover:underline"><Mail className="size-3.5" aria-hidden /> {m.email}</a>
                      {m.phone ? <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-leaf-600 hover:underline"><Phone className="size-3.5" aria-hidden /> {m.phone}</a> : null}
                      {m.orderNumber ? (
                        <Link href={`/admin/orders?q=${encodeURIComponent(m.orderNumber)}`} className="text-ink-soft hover:underline">Order {m.orderNumber}</Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <time dateTime={m.createdAt} title={formatDateTime(m.createdAt)} className="text-xs text-muted">{timeAgo(m.createdAt)}</time>
                    {m.status === "open" ? <Badge tone="amber">Open</Badge> : <Badge tone="green">Resolved</Badge>}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-[0.9375rem] text-ink-soft">{m.message}</p>
                <div className="mt-4 flex justify-end">
                  {m.status === "open" ? (
                    <Button size="sm" variant="outline" loading={busy === m.id} onClick={() => setStatus(m, "closed")}>
                      {busy !== m.id ? <CheckCircle2 className="size-4" aria-hidden /> : null} Mark resolved
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" loading={busy === m.id} onClick={() => setStatus(m, "open")}>
                      {busy !== m.id ? <RotateCcw className="size-4" aria-hidden /> : null} Reopen
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
