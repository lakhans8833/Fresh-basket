import type { Order, PlaceOrderResponse } from "@shared/types";
import { api } from "./api";

export const fetchOrder = (id: string) => api<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}`);

export const resumePayment = (id: string) =>
  api<Required<Pick<PlaceOrderResponse, "order" | "payment">>>(`/api/orders/${encodeURIComponent(id)}/pay`, { method: "POST" });

export const cancelOrder = (id: string) => api<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });

export const reorder = (id: string) =>
  api<{ items: { variantId: string; quantity: number; productSlug: string }[]; skipped: string[] }>(`/api/orders/${encodeURIComponent(id)}/reorder`, {
    method: "POST",
  });

/** Turn 409 ORDER_REJECTED details.messages into readable lines. */
export function rejectionMessages(details: unknown, nameOf: (variantId: string) => string | undefined): string[] {
  const msgs = (details as { messages?: Record<string, string> } | null)?.messages;
  if (!msgs) return [];
  return Object.entries(msgs).map(([k, m]) => {
    if (k.startsWith("_")) return m;
    const n = nameOf(k);
    return n ? `${n}: ${m}` : m;
  });
}
