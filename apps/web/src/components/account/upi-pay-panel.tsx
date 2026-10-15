"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Copy, QrCode, Smartphone } from "lucide-react";
import { formatINR } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";

export interface UpiInfo {
  upiId: string;
  payeeName: string | null;
  amount: number;
  uri: string;
  qrSvg: string;
  qrImageUrl: string | null;
}

/**
 * Pay by UPI: QR (with the exact amount), the UPI ID to copy, an "open UPI app" link on phones, and
 * a box for the UTR. Sending the UTR does NOT mark the order paid — staff confirm the money first.
 */
export function UpiPayPanel({ orderId, orderNumber, trackKey, info, reported }: { orderId: string; orderNumber: string; trackKey?: string; info: UpiInfo; reported: string | null }) {
  const router = useRouter();
  const [ref, setRef] = useState(reported ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(reported);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ reference: string }>(`/api/orders/${orderId}/upi-reference`, { method: "POST", json: { reference: ref, k: trackKey } });
      setSent(r.reference);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the ID is visible to copy by hand */
    }
  }

  return (
    <section aria-labelledby="upi-h" className="mt-5 rounded-[var(--radius-card)] border-2 border-[#f0d9a6] bg-[#fffaf0] p-5 sm:p-6">
      <h3 id="upi-h" className="flex items-center gap-2 text-xl font-semibold text-forest-900">
        <QrCode className="size-5" aria-hidden /> Pay {formatINR(info.amount)} by UPI
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        Status: <b>Payment pending</b>. We confirm UPI payments by checking our account, then pack your order. A screenshot or UTR alone doesn&apos;t mark it paid.
      </p>
      <div className="mt-5 grid gap-6 sm:grid-cols-[13rem_1fr]">
        <div className="text-center">
          <div
            className="mx-auto w-48 rounded-xl bg-white p-2 ring-1 ring-line [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label={`UPI QR code to pay ${formatINR(info.amount)} to ${info.upiId}`}
            // QR markup is generated on our server from the UPI link (no user input in it).
            dangerouslySetInnerHTML={{ __html: info.qrSvg }}
          />
          <p className="mt-2 text-xs text-muted">Scan with any UPI app — amount {formatINR(info.amount)} is filled in.</p>
        </div>
        <div className="space-y-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted">UPI ID:</dt>
              <dd className="font-semibold text-ink">{info.upiId}</dd>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-forest-800 hover:bg-sage-50">
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {info.payeeName ? <div className="flex gap-2"><dt className="text-muted">Name:</dt><dd className="text-ink">{info.payeeName}</dd></div> : null}
            <div className="flex gap-2"><dt className="text-muted">Amount:</dt><dd className="font-bold tabular-nums text-ink">{formatINR(info.amount)}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Note:</dt><dd className="text-ink">Order {orderNumber}</dd></div>
          </dl>
          <a href={info.uri} className="inline-flex h-10 items-center gap-2 rounded-full bg-forest-800 px-4 font-semibold text-white hover:bg-forest-900 md:hidden">
            <Smartphone className="size-4" aria-hidden /> Open UPI app
          </a>
          {info.qrImageUrl ? (
            <details className="rounded-xl border border-line bg-white p-3">
              <summary className="cursor-pointer font-medium text-forest-800">Show the store&apos;s QR instead</summary>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded QR of unknown size */}
              <img src={info.qrImageUrl} alt={`Store UPI QR code (${info.upiId})`} className="mx-auto mt-3 max-h-64 w-auto" />
              <p className="mt-2 text-xs text-muted">With this QR, type the amount {formatINR(info.amount)} yourself.</p>
            </details>
          ) : null}
          <form onSubmit={submit} className="space-y-2">
            <Field label="After paying: UPI reference / UTR number" htmlFor="upi-ref" hint="12-digit number shown in your UPI app's payment details." error={error}>
              <Input id="upi-ref" value={ref} onChange={(e) => setRef(e.target.value)} inputMode="text" autoComplete="off" maxLength={40} placeholder="e.g. 412345678901" invalid={!!error} />
            </Field>
            <Button type="submit" variant="dark" size="sm" loading={busy} disabled={!ref.trim()}>{sent ? "Update reference" : "Send reference"}</Button>
          </form>
          {sent ? (
            <Notice tone="info">Thanks — we received reference <b>{sent}</b>. We&apos;ll confirm once the money shows in our account; this page updates automatically.</Notice>
          ) : null}
        </div>
      </div>
    </section>
  );
}
