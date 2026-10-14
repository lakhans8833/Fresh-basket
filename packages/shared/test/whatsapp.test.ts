import { describe, expect, it } from "vitest";
import {
  buildWhatsAppOrderMessage, buildWhatsAppOrderUrl, buildWhatsAppUrl, cleanText, makeOrderReference,
  normalizeWhatsAppNumber, validateWhatsAppOrder, whatsappCustomerSchema, type WhatsAppOrder,
} from "../src/whatsapp";

const customer = whatsappCustomerSchema.parse({
  name: "Lakhan Singh", phone: "+91 98765 43210", address: "H.No 12, Sector 7, near park", area: "Sector 7",
  city: "Faridabad", pincode: "121006", notes: "Call before coming",
});

const order = (o: Partial<WhatsAppOrder> = {}): WhatsAppOrder => ({
  storeName: "Ram Avatar Fresh Basket",
  reference: "WA-261014-ABCD",
  customer,
  lines: [
    { name: "Tomato", variantLabel: "1 kg", quantity: 2, unitPrice: 4000, lineTotal: 8000 },
    { name: "Spinach (Palak)", variantLabel: "250 g", quantity: 1, unitPrice: 2000, lineTotal: 2000 },
  ],
  subtotal: 10000, discount: 0, couponCode: null, deliveryFee: 2000, total: 12000, ...o,
});

describe("normalizeWhatsAppNumber", () => {
  it("accepts international and Indian local formats", () => {
    expect(normalizeWhatsAppNumber("919876543210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("+91 98765-43210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("9876543210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("09876543210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("0091 98765 43210")).toBe("919876543210");
  });
  it("rejects invalid numbers", () => {
    for (const bad of ["", null, undefined, "12345", "0123456789", "abc", "1234567890123456"]) {
      expect(normalizeWhatsAppNumber(bad as string)).toBeNull();
    }
  });
});

describe("customer validation", () => {
  it("normalises the phone and requires address and PIN", () => {
    expect(customer.phone).toBe("9876543210");
    const r = whatsappCustomerSchema.safeParse({ name: "A", phone: "123", address: "x", city: "", pincode: "12" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields = new Set(r.error.issues.map((i) => i.path[0]));
      expect([...fields].sort()).toEqual(["address", "city", "name", "phone", "pincode"]);
    }
  });
});

describe("order message", () => {
  it("contains customer details, items, totals and is URL-encoded", () => {
    const msg = buildWhatsAppOrderMessage(order());
    expect(msg).toContain("Name: Lakhan Singh");
    expect(msg).toContain("Mobile: +91 9876543210");
    expect(msg).toContain("City / PIN: Faridabad - 121006");
    expect(msg).toContain("1. Tomato (1 kg) × 2 = ₹80");
    expect(msg).toContain("Delivery: ₹20");
    expect(msg).toContain("*Total: ₹120*");
    const url = buildWhatsAppOrderUrl("919876543210", order());
    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1]!)).toBe(msg);
    const text = url.split("?text=")[1]!;
    expect(text).not.toMatch(/[\s#&?\n]/); // everything after text= is percent-encoded
  });

  it("marks unknown delivery charges and free delivery honestly", () => {
    expect(buildWhatsAppOrderMessage(order({ deliveryFee: null, total: 10000 }))).toContain("Delivery: to be confirmed");
    expect(buildWhatsAppOrderMessage(order({ deliveryFee: 0, total: 10000 }))).toContain("Delivery: Free");
  });

  it("strips formatting and control characters from customer text", () => {
    expect(cleanText("*Bold* _x_ ~y~ `z`\u0000‮", 50)).toBe("Bold x y z");
    expect(cleanText("a\n\nb   c", 50)).toBe("a b c");
    expect(cleanText("x".repeat(30), 10)).toHaveLength(10);
    const msg = buildWhatsAppOrderMessage(order({ customer: { ...customer, name: "*Hacker* & co #1?" } }));
    expect(msg).toContain("Name: Hacker & co #1?");
  });

  it("rejects inconsistent totals and bad quantities", () => {
    expect(validateWhatsAppOrder(order({ total: 1 }))).toMatch(/Total/);
    expect(validateWhatsAppOrder(order({ subtotal: 1 }))).toMatch(/Subtotal/);
    expect(validateWhatsAppOrder(order({ lines: [] }))).toMatch(/empty/);
    expect(validateWhatsAppOrder(order({ lines: [{ name: "X", variantLabel: "", quantity: 0, unitPrice: 100, lineTotal: 0 }], subtotal: 0, total: 2000 }))).toMatch(/quantity/);
    expect(() => buildWhatsAppOrderMessage(order({ total: 5 }))).toThrow();
    expect(() => buildWhatsAppUrl("123")).toThrow();
  });

  it("makes readable references", () => {
    expect(makeOrderReference(new Date("2026-10-14T20:00:00Z"), () => 0)).toBe("WA-261015-AAAA");
  });
});
