import type { Order, PlaceOrderResponse } from "@shared/types";
import { api } from "./api";

export const fetchOrder = (id: string) => api<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}`);

export const resumePayment = (id: string) =>
  api<Required<Pick<PlaceOrderResponse, "order" | "payment">>>(`/api/orders/${encodeURIComponent(id)}/pay`, { method: "POST" });

export const cancelOrder = (id: string) => api<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });

/**
 * "Buy again". Sends the current basket so the server returns how many to ADD on top of it (within
 * today's stock); without it the server assumes an empty basket and quantities would double.
 */
export const reorder = (id: string, cart: { variantId: string; quantity: number }[]) =>
  api<{
    /** quantity: how many to add now; requested: in the old order; inCart: already in the basket. */
    items: { variantId: string; quantity: number; productSlug: string; price: number; oldPrice: number; requested: number; inCart: number }[];
    skipped: { productName: string; variantLabel: string; reason: "unavailable" | "out_of_stock" }[];
  }>(`/api/orders/${encodeURIComponent(id)}/reorder`, { method: "POST", body: { cart } });

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
