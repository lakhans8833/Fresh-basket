"use client";

import { api } from "@/lib/client/api";
import type { CartLine } from "../cart/cart-context";

export interface BuyAgainResult {
  items: {
    variantId: string; productSlug: string; productName: string; variantLabel: string; imageUrl: string | null;
    quantity: number; requested: number; price: number; oldPrice: number;
  }[];
  skipped: { productName: string; variantLabel: string; reason: "unavailable" | "out_of_stock" }[];
}

/** What the cart page shows once after "Buy again": price changes, reduced quantities, unavailable items. */
export interface BuyAgainNotice {
  orderNumber: string;
  added: number;
  changed: { name: string; oldPrice: number; price: number }[];
  reduced: { name: string; requested: number; quantity: number }[];
  skipped: { name: string; reason: "unavailable" | "out_of_stock" }[];
}

export const BUY_AGAIN_NOTICE_KEY = "fb_buy_again_notice";

/**
 * Adds a past order's items to the cart at TODAY's prices (re-checked on the server) and remembers
 * what changed for the cart page. Returns the number of items added.
 */
export async function buyAgain(
  order: { id: string; orderNumber: string },
  cart: { lines: CartLine[]; add: (line: Omit<CartLine, "quantity">, qty?: number) => void },
): Promise<number> {
  const r = await api<BuyAgainResult>(`/api/orders/${order.id}/reorder`, { method: "POST" });
  let added = 0;
  for (const it of r.items) {
    const existing = cart.lines.find((l) => l.variantId === it.variantId)?.quantity ?? 0;
    if (it.quantity > existing) {
      cart.add({ variantId: it.variantId, productName: it.productName, productSlug: it.productSlug, variantLabel: it.variantLabel, imageUrl: it.imageUrl, priceHint: it.price }, it.quantity - existing);
    }
    added++;
  }
  const notice: BuyAgainNotice = {
    orderNumber: order.orderNumber,
    added,
    changed: r.items.filter((i) => i.price !== i.oldPrice).map((i) => ({ name: `${i.productName} (${i.variantLabel})`, oldPrice: i.oldPrice, price: i.price })),
    reduced: r.items.filter((i) => i.quantity < i.requested).map((i) => ({ name: `${i.productName} (${i.variantLabel})`, requested: i.requested, quantity: i.quantity })),
    skipped: r.skipped.map((s) => ({ name: `${s.productName} (${s.variantLabel})`, reason: s.reason })),
  };
  try {
    sessionStorage.setItem(BUY_AGAIN_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    /* storage unavailable: the cart still has the items */
  }
  return added;
}

export function takeBuyAgainNotice(): BuyAgainNotice | null {
  try {
    const raw = sessionStorage.getItem(BUY_AGAIN_NOTICE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(BUY_AGAIN_NOTICE_KEY);
    return JSON.parse(raw) as BuyAgainNotice;
  } catch {
    return null;
  }
}
