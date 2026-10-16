import type { Paise } from "./money";

export const MAX_QTY_PER_LINE = 20;
export const MAX_LINES = 50;

export interface PricedLineInput {
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPrice: Paise;
  quantity: number;
  stock: number;
  active: boolean;
  /** This pack shares a weight total with other pack sizes of the same product in the basket. */
  sharedStock?: boolean;
}

export interface CouponRule {
  code: string;
  kind: "percent" | "flat";
  /** percent: whole percent 1-100; flat: paise */
  value: number;
  minOrder: Paise;
  maxDiscount: Paise | null;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  usedByUser: number;
  /** Only for a customer's first order. */
  firstOrderOnly?: boolean;
  /** Whether this customer has no earlier (non-cancelled) order; null when not signed in. */
  isFirstOrder?: boolean | null;
}

export interface DeliveryRule {
  fee: Paise;
  freeAbove: Paise | null;
  minOrder: Paise;
}

export type QuoteIssue =
  | { code: "OUT_OF_STOCK"; variantId: string; available: number; shared?: boolean }
  | { code: "UNAVAILABLE"; variantId: string }
  | { code: "INVALID_QUANTITY"; variantId: string }
  | { code: "EMPTY_CART" }
  | { code: "TOO_MANY_LINES" }
  | { code: "COUPON_INVALID"; reason: string }
  | { code: "BELOW_MIN_ORDER"; minOrder: Paise; shortBy: Paise }
  | { code: "AREA_NOT_SERVICEABLE" };

export interface QuoteLine {
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPrice: Paise;
  quantity: number;
  lineTotal: Paise;
  /** Most of this pack the basket can hold right now (stock left after the basket's other lines, capped per line). */
  maxQuantity: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: Paise;
  discount: Paise;
  couponCode: string | null;
  deliveryFee: Paise;
  total: Paise;
  issues: QuoteIssue[];
  /** true when the order can be placed exactly as quoted */
  ok: boolean;
}

export function couponProblem(c: CouponRule, subtotal: Paise, now: Date): string | null {
  if (!c.active) return "This coupon is not active.";
  if (c.startsAt && now < c.startsAt) return "This coupon is not active yet.";
  if (c.endsAt && now > c.endsAt) return "This coupon has expired.";
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return "This coupon has reached its usage limit.";
  if (c.perUserLimit !== null && c.usedByUser >= c.perUserLimit) return "You have already used this coupon.";
  if (c.firstOrderOnly && c.isFirstOrder === null) return "Sign in to use this first-order coupon.";
  if (c.firstOrderOnly && c.isFirstOrder === false) return "This coupon is only for your first order.";
  if (subtotal < c.minOrder) return `Add items worth ${c.minOrder - subtotal} paise more to use this coupon.`;
  return null;
}

export function couponDiscount(c: CouponRule, subtotal: Paise): Paise {
  let d = c.kind === "percent" ? Math.floor((subtotal * Math.min(Math.max(c.value, 0), 100)) / 100) : c.value;
  if (c.maxDiscount !== null) d = Math.min(d, c.maxDiscount);
  return Math.max(0, Math.min(d, subtotal));
}

/**
 * Pure, deterministic order total calculation. The server is the only caller whose
 * result is trusted: it loads prices/stock/coupon/delivery rules from the database.
 */
export function computeQuote(args: {
  lines: PricedLineInput[];
  coupon: CouponRule | null;
  couponCodeRequested: string | null;
  delivery: DeliveryRule | null; // null = pincode not given or not serviceable
  deliveryRequired: boolean;
  now?: Date;
}): Quote {
  const now = args.now ?? new Date();
  const issues: QuoteIssue[] = [];
  const lines: QuoteLine[] = [];

  if (args.lines.length === 0) issues.push({ code: "EMPTY_CART" });
  if (args.lines.length > MAX_LINES) issues.push({ code: "TOO_MANY_LINES" });

  for (const l of args.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY_PER_LINE) {
      issues.push({ code: "INVALID_QUANTITY", variantId: l.variantId });
      continue;
    }
    if (!l.active) {
      issues.push({ code: "UNAVAILABLE", variantId: l.variantId });
      continue;
    }
    if (l.stock < l.quantity) {
      issues.push({ code: "OUT_OF_STOCK", variantId: l.variantId, available: Math.max(0, l.stock), ...(l.sharedStock ? { shared: true } : {}) });
    }
    lines.push({
      variantId: l.variantId,
      productName: l.productName,
      variantLabel: l.variantLabel,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: l.unitPrice * l.quantity,
      maxQuantity: Math.max(0, Math.min(MAX_QTY_PER_LINE, l.stock)),
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let discount = 0;
  let couponCode: string | null = null;
  if (args.couponCodeRequested) {
    if (!args.coupon) {
      issues.push({ code: "COUPON_INVALID", reason: "This coupon code is not valid." });
    } else {
      const problem = couponProblem(args.coupon, subtotal, now);
      if (problem) {
        issues.push({ code: "COUPON_INVALID", reason: problem });
      } else {
        discount = couponDiscount(args.coupon, subtotal);
        couponCode = args.coupon.code;
      }
    }
  }

  const afterDiscount = subtotal - discount;
  let deliveryFee = 0;
  if (args.delivery) {
    deliveryFee =
      args.delivery.freeAbove !== null && afterDiscount >= args.delivery.freeAbove ? 0 : args.delivery.fee;
    if (lines.length > 0 && afterDiscount < args.delivery.minOrder) {
      issues.push({
        code: "BELOW_MIN_ORDER",
        minOrder: args.delivery.minOrder,
        shortBy: args.delivery.minOrder - afterDiscount,
      });
    }
  } else if (args.deliveryRequired) {
    issues.push({ code: "AREA_NOT_SERVICEABLE" });
  }

  const total = afterDiscount + deliveryFee;
  return { lines, subtotal, discount, couponCode, deliveryFee, total, issues, ok: issues.length === 0 };
}

export function describeIssue(issue: QuoteIssue, formatMoney: (p: Paise) => string): string {
  switch (issue.code) {
    case "OUT_OF_STOCK":
      if (issue.shared) {
        return issue.available > 0
          ? `Only ${issue.available} of this size fit — other sizes of this item in your basket use the same stock.`
          : "Not enough left — other sizes of this item in your basket already use the stock.";
      }
      return issue.available > 0 ? `Only ${issue.available} left in stock.` : "Out of stock.";
    case "UNAVAILABLE":
      return "This item is no longer available.";
    case "INVALID_QUANTITY":
      return `Quantity must be between 1 and ${MAX_QTY_PER_LINE}.`;
    case "EMPTY_CART":
      return "Your basket is empty.";
    case "TOO_MANY_LINES":
      return `A basket can hold up to ${MAX_LINES} different items.`;
    case "COUPON_INVALID":
      return issue.reason.replace(/(\d+) paise/, (_, p) => formatMoney(Number(p)));
    case "BELOW_MIN_ORDER":
      return `Minimum order is ${formatMoney(issue.minOrder)}. Add ${formatMoney(issue.shortBy)} more.`;
    case "AREA_NOT_SERVICEABLE":
      return "We don't deliver to this PIN code yet.";
  }
}
