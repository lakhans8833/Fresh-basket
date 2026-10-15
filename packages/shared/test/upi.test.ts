import { describe, expect, it } from "vitest";
import { buildUpiUri, isValidUpiId } from "../src/upi";
import { upiReferenceSchema, whatsappOrderSchema } from "../src/schemas";
import { buildWhatsAppOrderMessage } from "../src/whatsapp";

describe("UPI", () => {
  it("validates UPI IDs", () => {
    expect(isValidUpiId("ramavatar.store@okaxis")).toBe(true);
    expect(isValidUpiId("9876543210@ybl")).toBe(true);
    expect(isValidUpiId("no-at-sign")).toBe(false);
    expect(isValidUpiId("a@1bank")).toBe(false);
  });
  it("builds a upi://pay link with the exact amount and order number", () => {
    const u = buildUpiUri({ upiId: "store@okaxis", payeeName: "Ram Avatar <Fresh>", amount: 24150, orderNumber: "FB261017-01001" });
    const q = new URLSearchParams(u.replace("upi://pay?", ""));
    expect(u.startsWith("upi://pay?")).toBe(true);
    expect(q.get("pa")).toBe("store@okaxis");
    expect(q.get("am")).toBe("241.50");
    expect(q.get("cu")).toBe("INR");
    expect(q.get("tn")).toBe("Order FB261017-01001");
    expect(q.get("pn")).toBe("Ram Avatar Fresh");
    expect(() => buildUpiUri({ upiId: "bad", amount: 100, orderNumber: "X" })).toThrow();
    expect(() => buildUpiUri({ upiId: "a@okaxis", amount: 0, orderNumber: "X" })).toThrow();
  });
  it("cleans UTR references", () => {
    expect(upiReferenceSchema.parse({ reference: " 4123 4567 8901 " }).reference).toBe("412345678901");
    expect(upiReferenceSchema.safeParse({ reference: "12-34" }).success).toBe(false);
  });
});

describe("WhatsApp order message", () => {
  it("includes order ID, payment method/status, pay link and tracking link", () => {
    const customer = whatsappOrderSchema.shape.customer.parse({ name: "Asha Rao", phone: "9876543210", address: "H.No 12, Sector 7", city: "Faridabad", pincode: "121006" });
    const msg = buildWhatsAppOrderMessage({
      storeName: "Fresh Basket", reference: "FB261017-01001", customer,
      lines: [{ name: "Tomato", variantLabel: "1 kg", quantity: 2, unitPrice: 6000, lineTotal: 12000 }],
      subtotal: 12000, discount: 0, couponCode: null, deliveryFee: 2500, total: 14500,
      paymentMethod: "UPI (QR / UPI ID)", paymentStatus: "Payment pending",
      payLink: "https://rzp.io/l/abc", trackUrl: "https://example.test/track/1?k=x",
    });
    expect(msg).toContain("Order ID: FB261017-01001");
    expect(msg).toContain("Delivery: ₹25");
    expect(msg).toContain("*Total: ₹145*");
    expect(msg).toContain("Payment: UPI (QR / UPI ID) (Payment pending)");
    expect(msg).toContain("Pay online: https://rzp.io/l/abc");
    expect(msg).toContain("Track order: https://example.test/track/1?k=x");
  });
});
