import { rupeesToPaise } from "@freshbasket/shared";

/** Money is stored as integer paise; staff type rupees ("32" or "32.50"). */
const RUPEES = /^\d{1,7}(\.\d{1,2})?$/;

export function paiseToInput(p: number | null | undefined): string {
  if (p === null || p === undefined) return "";
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);
}

/** Returns paise, null for an empty string, or NaN when the text isn't a valid rupee amount. */
export function inputToPaise(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!RUPEES.test(t)) return NaN;
  return rupeesToPaise(Number(t));
}

export function isValidRupees(s: string, { required = false } = {}) {
  const v = inputToPaise(s);
  if (v === null) return !required;
  return !Number.isNaN(v);
}

export function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}
