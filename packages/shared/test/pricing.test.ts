import { describe, expect, it } from "vitest";
import { computeQuote, couponDiscount, couponProblem, type CouponRule, type PricedLineInput } from "../src/pricing";
import { canAdminTransition, canCustomerCancel } from "../src/orderStatus";
import { isValidPincode, isValidIndianMobile } from "../src/pincode";
import { isSlotBookable, istInstant, istDateString } from "../src/slots";
import { placeOrderSchema } from "../src/schemas";

const line = (o: Partial<PricedLineInput> = {}): PricedLineInput => ({
  variantId: "v1", productName: "Tomato", variantLabel: "500 g", unitPrice: 3200, quantity: 2, stock: 10, active: true, ...o,
});
const coupon = (o: Partial<CouponRule> = {}): CouponRule => ({
  code: "FRESH10", kind: "percent", value: 10, minOrder: 0, maxDiscount: null, active: true,
  startsAt: null, endsAt: null, usageLimit: null, usedCount: 0, perUserLimit: null, usedByUser: 0, ...o,
});
const delivery = { fee: 2500, freeAbove: 49900, minOrder: 9900 };

describe("computeQuote", () => {
  it("sums lines and adds delivery fee below the free threshold", () => {
    const q = computeQuote({ lines: [line(), line({ variantId: "v2", unitPrice: 4500, quantity: 1 })], coupon: null, couponCodeRequested: null, delivery, deliveryRequired: true });
    expect(q.subtotal).toBe(3200 * 2 + 4500);
    expect(q.deliveryFee).toBe(2500);
    expect(q.total).toBe(10900 + 2500);
    expect(q.ok).toBe(true);
  });

  it("waives delivery at or above freeAbove (after discount)", () => {
    const q = computeQuote({ lines: [line({ unitPrice: 25000, quantity: 2 })], coupon: null, couponCodeRequested: null, delivery, deliveryRequired: true });
    expect(q.deliveryFee).toBe(0);
    const q2 = computeQuote({ lines: [line({ unitPrice: 25000, quantity: 2 })], coupon: coupon({ kind: "flat", value: 500 }), couponCodeRequested: "FRESH10", delivery, deliveryRequired: true });
    expect(q2.subtotal - q2.discount).toBe(49500);
    expect(q2.deliveryFee).toBe(2500);
  });

  it("applies percent coupon with cap and never exceeds subtotal", () => {
    expect(couponDiscount(coupon({ value: 50, maxDiscount: 1000 }), 10000)).toBe(1000);
    expect(couponDiscount(coupon({ kind: "flat", value: 99999 }), 5000)).toBe(5000);
    expect(couponDiscount(coupon({ value: 15 }), 3333)).toBe(499); // floors
  });

  it("rejects expired, unstarted, exhausted and under-minimum coupons", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    const base = { lines: [line()], couponCodeRequested: "FRESH10", delivery, deliveryRequired: true, now };
    for (const c of [
      coupon({ endsAt: new Date("2026-10-01") }),
      coupon({ startsAt: new Date("2026-11-01") }),
      coupon({ usageLimit: 5, usedCount: 5 }),
      coupon({ perUserLimit: 1, usedByUser: 1 }),
      coupon({ minOrder: 100000 }),
      coupon({ active: false }),
    ]) {
      const q = computeQuote({ ...base, coupon: c });
      expect(q.discount).toBe(0);
      expect(q.issues.some((i) => i.code === "COUPON_INVALID")).toBe(true);
    }
    expect(computeQuote({ ...base, coupon: null }).issues[0]?.code).toBe("COUPON_INVALID");
  });

  it("flags stock, inactive items, bad quantities and minimum order", () => {
    const q = computeQuote({
      lines: [line({ stock: 1 }), line({ variantId: "v2", active: false }), line({ variantId: "v3", quantity: 0 })],
      coupon: null, couponCodeRequested: null, delivery: { ...delivery, minOrder: 100000 }, deliveryRequired: true,
    });
    const codes = q.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "BELOW_MIN_ORDER"]));
    expect(q.ok).toBe(false);
    expect(q.lines).toHaveLength(1); // inactive and invalid lines are excluded from totals
  });

  it("requires a serviceable area when delivery is required", () => {
    const q = computeQuote({ lines: [line()], coupon: null, couponCodeRequested: null, delivery: null, deliveryRequired: true });
    expect(q.issues).toContainEqual({ code: "AREA_NOT_SERVICEABLE" });
    expect(computeQuote({ lines: [line()], coupon: null, couponCodeRequested: null, delivery: null, deliveryRequired: false }).ok).toBe(true);
  });
});

describe("order status rules", () => {
  it("only allows forward admin transitions and never marks paid manually", () => {
    expect(canAdminTransition("placed", "packed")).toBe(true);
    expect(canAdminTransition("packed", "out_for_delivery")).toBe(true);
    expect(canAdminTransition("pending_payment", "placed")).toBe(false);
    expect(canAdminTransition("delivered", "cancelled")).toBe(false);
    expect(canAdminTransition("placed", "delivered")).toBe(false);
    expect(canCustomerCancel("placed")).toBe(true);
    expect(canCustomerCancel("packed")).toBe(false);
  });
});

describe("validation helpers", () => {
  it("validates PIN codes and mobiles", () => {
    expect(isValidPincode("560034")).toBe(true);
    expect(isValidPincode("060034")).toBe(false);
    expect(isValidPincode("56003")).toBe(false);
    expect(isValidIndianMobile("+91 98765 43210")).toBe(true);
    expect(isValidIndianMobile("12345 67890")).toBe(false);
  });

  it("requires an address on place order", () => {
    const r = placeOrderSchema.safeParse({ items: [{ variantId: "6f1c2b8e-3a6d-4c1e-9f57-0a1b2c3d4e5f", quantity: 1 }], slotId: "6f1c2b8e-3a6d-4c1e-9f57-0a1b2c3d4e5f", deliveryDate: "2026-10-15", paymentMethod: "cod", idempotencyKey: "abcdefgh12" });
    expect(r.success).toBe(false);
  });
});

describe("slots (IST)", () => {
  it("converts IST dates and enforces cutoff and capacity", () => {
    expect(istInstant("2026-10-15", "07:00").toISOString()).toBe("2026-10-15T01:30:00.000Z");
    expect(istDateString(new Date("2026-10-14T19:00:00Z"))).toBe("2026-10-15");
    const slot = { id: "s", label: "Morning", startTime: "07:00", endTime: "10:00", cutoffMinutes: 120, capacity: 10, active: true };
    expect(isSlotBookable(slot, "2026-10-15", new Date("2026-10-14T23:29:00Z"), 0)).toBe(true);
    expect(isSlotBookable(slot, "2026-10-15", new Date("2026-10-14T23:31:00Z"), 0)).toBe(false);
    expect(isSlotBookable(slot, "2026-10-16", new Date("2026-10-14T23:31:00Z"), 10)).toBe(false);
  });
});

describe("first-order coupons", () => {
  const base = { code: "WELCOME50", kind: "flat" as const, value: 5000, minOrder: 0, maxDiscount: null, active: true, startsAt: null, endsAt: null, usageLimit: null, usedCount: 0, perUserLimit: 1, usedByUser: 0, firstOrderOnly: true };
  it("allows a first order", () => expect(couponProblem({ ...base, isFirstOrder: true }, 50000, new Date())).toBeNull());
  it("refuses a repeat customer", () => expect(couponProblem({ ...base, isFirstOrder: false }, 50000, new Date())).toBe("This coupon is only for your first order."));
  it("asks guests to sign in", () => expect(couponProblem({ ...base, isFirstOrder: null }, 50000, new Date())).toBe("Sign in to use this first-order coupon."));
  it("ignores the rule for normal coupons", () => expect(couponProblem({ ...base, firstOrderOnly: false, isFirstOrder: false }, 50000, new Date())).toBeNull());
});
