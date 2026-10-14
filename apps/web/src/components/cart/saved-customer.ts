"use client";

import type { WhatsAppCustomerInput } from "@freshbasket/shared";

const KEY = "fb_wa_customer_v1";

/** Customer details remembered on this device only (opt-in on the order form). */
export function loadSavedCustomer(): Partial<WhatsAppCustomerInput> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<WhatsAppCustomerInput>) : null;
  } catch {
    return null;
  }
}

export function saveCustomer(c: Partial<WhatsAppCustomerInput> | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify({ ...c, notes: "" }));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
