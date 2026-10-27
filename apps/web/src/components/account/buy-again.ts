"use client";

import { api } from "@/lib/client/api";
import type { CartLine } from "../cart/cart-context";

export interface BuyAgainResult {
  items: {
    variantId: string; productSlug: string; productName: string; variantLabel: string; imageUrl: string | null;
    /** How many to add now (on top of what's already in the cart: `inCart`). */
    quantity: number; requested: number; inCart: number; price: number; oldPrice: number;
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
 * what changed for the cart page. Returns how many of the order's items are still available.
 */
export async function buyAgain(
  order: { id: string; orderNumber: string },
  cart: { lines: CartLine[]; add: (line: Omit<CartLine, "quantity">, qty?: number) => void },
): Promise<number> {
  const r = await api<BuyAgainResult>(`/api/orders/${order.id}/reorder`, {
    method: "POST",
    json: { cart: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) },
  });
  // `available`: items of the order still on sale (what the caller checks); `added`: items actually
  // put in the cart now (0 when they're all already there, e.g. a second tap).
  let added = 0;
  const available = r.items.length;
  for (const it of r.items) {
    if (it.quantity > 0) {
      cart.add({ variantId: it.variantId, productName: it.productName, productSlug: it.productSlug, variantLabel: it.variantLabel, imageUrl: it.imageUrl, priceHint: it.price }, it.quantity);
      added++;
    }
  }
  const notice: BuyAgainNotice = {
    orderNumber: order.orderNumber,
    added,
    changed: r.items.filter((i) => i.price !== i.oldPrice).map((i) => ({ name: `${i.productName} (${i.variantLabel})`, oldPrice: i.oldPrice, price: i.price })),
    reduced: r.items.filter((i) => i.inCart + i.quantity < i.requested).map((i) => ({ name: `${i.productName} (${i.variantLabel})`, requested: i.requested, quantity: i.inCart + i.quantity })),
    skipped: r.skipped.map((s) => ({ name: `${s.productName} (${s.variantLabel})`, reason: s.reason })),
  };
  try {
    sessionStorage.setItem(BUY_AGAIN_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    /* storage unavailable: the cart still has the items */
  }
  return available;
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
