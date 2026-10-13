import type { OrderStatus } from "@shared/orderStatus";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-14" -> "Wed, 14 Oct" (calendar date, timezone independent) */
export function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return `${days[dt.getUTCDay()]}, ${dt.getUTCDate()} ${months[dt.getUTCMonth()]}`;
}

/** ISO timestamp -> "14 Oct, 7:29 PM" in the device's local time */
export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  const h = dt.getHours();
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${dt.getDate()} ${months[dt.getMonth()]}, ${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
}

export function statusTone(s: OrderStatus): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (s) {
    case "delivered":
      return "success";
    case "cancelled":
      return "danger";
    case "pending_payment":
      return "warning";
    default:
      return "info";
  }
}
