"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Star } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { Stars } from "../product/stars";
import { errorMessage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { Badge, LoadError, LoadingRows, PageHeader, formatDateTime } from "./ui";

type Status = "pending" | "approved" | "hidden";
interface AdminReview {
  id: string; rating: number; comment: string | null; status: Status; createdAt: string; updatedAt: string;
  productName: string; productSlug: string; customerName: string | null; customerEmail: string | null; orderNumber: string | null;
}

const TABS: { value: Status | ""; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Published" },
  { value: "hidden", label: "Hidden" },
  { value: "", label: "All" },
];
const TONE: Record<Status, "amber" | "green" | "neutral"> = { pending: "amber", approved: "green", hidden: "neutral" };
const LABEL: Record<Status, string> = { pending: "Waiting for approval", approved: "Published", hidden: "Hidden" };

export function ReviewsManager() {
  return (
    <AdminOnly>
      <Inner />
    </AdminOnly>
  );
}

function Inner() {
  const toast = useToast();
  const [tab, setTab] = useState<Status | "">("pending");
  const { data, error, loading, reload, setData } = useAdminData<{ reviews: AdminReview[] }>(`/api/admin/reviews${tab ? `?status=${tab}` : ""}`);
  const [busy, setBusy] = useState<string | null>(null);
  const reviews = data?.reviews ?? [];

  async function setStatus(r: AdminReview, status: Status) {
    setBusy(r.id);
    try {
      const res = await api<{ updatedAt: string }>(`/api/admin/reviews/${r.id}`, { method: "PATCH", json: { status, updatedAt: r.updatedAt } });
      setData((d) => (d ? { reviews: tab ? d.reviews.filter((x) => x.id !== r.id) : d.reviews.map((x) => (x.id === r.id ? { ...x, status, updatedAt: res.updatedAt } : x)) } : d));
      toast(status === "approved" ? "Review published" : status === "hidden" ? "Review hidden" : "Review moved back to waiting");
    } catch (e) {
      toast(errorMessage(e));
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Only customers whose order with the product was delivered can review it. Reviews appear on the product page after you publish them."
      />
      <div role="tablist" aria-label="Filter reviews" className="mb-5 inline-flex flex-wrap gap-1 rounded-full border border-line bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.label}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", tab === t.value ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-sage-100")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={4} />
      ) : reviews.length === 0 ? (
        <EmptyState icon={<Star className="size-7" aria-hidden />} title={tab === "pending" ? "Nothing waiting" : "No reviews here"}>
          {tab === "pending" ? "New reviews from customers show up here for approval." : "Try another filter."}
        </EmptyState>
      ) : (
        <ul className={cn("space-y-3 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {reviews.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="sr-only">{r.rating} out of 5 stars</span>
                    <Link href={`/product/${r.productSlug}`} target="_blank" className="font-semibold text-forest-900 hover:underline">{r.productName}</Link>
                    <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {r.customerName || r.customerEmail || "Customer"}{r.orderNumber ? ` · order ${r.orderNumber}` : ""} · {formatDateTime(r.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.status !== "approved" ? (
                    <Button size="sm" variant="dark" loading={busy === r.id} onClick={() => void setStatus(r, "approved")}>
                      <Eye className="size-4" aria-hidden /> Publish
                    </Button>
                  ) : null}
                  {r.status !== "hidden" ? (
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void setStatus(r, "hidden")}>
                      <EyeOff className="size-4" aria-hidden /> Hide
                    </Button>
                  ) : null}
                </div>
              </div>
              {r.comment ? <p className="mt-3 whitespace-pre-line text-[0.9375rem] text-ink-soft">{r.comment}</p> : <p className="mt-3 text-sm italic text-muted">No comment — rating only.</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
