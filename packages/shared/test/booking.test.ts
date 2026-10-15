import { describe, expect, it } from "vitest";
import {
  buildBookingMessage, buildBookingWhatsAppUrl, buildUpiLink, canMoveBooking, createBookingSchema, nextBookingStatuses,
  type BookingMessageData,
} from "../src/booking";

const data = (o: Partial<BookingMessageData> = {}): BookingMessageData => ({
  storeName: "Ram Avatar Fresh Basket",
  bookingNumber: "WB261017-01001",
  customerName: "Lakhan *Singh*",
  customerPhone: "9876543210",
  address: "House 7, Street 2",
  area: "Sector 7",
  city: "Faridabad",
  pincode: "121006",
  notes: "Call before coming",
  deliveryDateLabel: "Fri, 17 Oct 2026",
  slotLabel: "Morning, 07:00–10:00",
  lines: [
    { productName: "Tomato", variantLabel: "1 kg", quantity: 2, unitPrice: 4000, lineTotal: 8000 },
    { productName: "Spinach & Methi", variantLabel: "250 g", quantity: 1, unitPrice: 2000, lineTotal: 2000 },
  ],
  subtotal: 10000, discount: 0, deliveryFee: 2000, total: 12000, paymentMethod: "upi_qr", upiId: "shop@okaxis", ...o,
});

describe("booking message", () => {
  it("contains every required field", () => {
    const m = buildBookingMessage(data());
    for (const s of [
      "Namaste Ram Avatar Fresh Basket! Mujhe apna order book karna hai.", "Booking ID: WB261017-01001", "Name: Lakhan Singh",
      "Mobile: +91 9876543210", "Delivery Address: House 7, Street 2, Sector 7, Faridabad - 121006", "Fri, 17 Oct 2026, Morning",
      "1. Tomato (1 kg) × 2 = ₹80", "Subtotal: ₹100", "Delivery Charges: ₹20", "Total Amount: ₹120", "Payment Method: UPI QR Code",
      "UPI ID: shop@okaxis",
    ]) expect(m).toContain(s);
  });

  it("refuses totals that don't add up", () => {
    expect(() => buildBookingMessage(data({ total: 1 }))).toThrow();
    expect(() => buildBookingMessage(data({ subtotal: 9000 }))).toThrow();
  });

  it("URL-encodes the message (& # + and new lines survive)", () => {
    const url = buildBookingWhatsAppUrl("919812345678", data());
    expect(url.startsWith("https://wa.me/919812345678?text=")).toBe(true);
    const q = url.split("?text=")[1]!;
    expect(q).not.toMatch(/[\s&#]/);
    expect(decodeURIComponent(q)).toContain("Spinach & Methi");
  });
});

describe("status rules", () => {
  it("allows only forward moves and cancel before delivery", () => {
    expect(nextBookingStatuses("pending_confirmation")).toEqual(["confirmed", "cancelled"]);
    expect(canMoveBooking("pending_confirmation", "delivered")).toBe(false);
    expect(canMoveBooking("out_for_delivery", "delivered")).toBe(true);
    expect(canMoveBooking("delivered", "cancelled")).toBe(false);
  });
});

describe("UPI link", () => {
  it("builds an exact-amount upi:// link", () => {
    const l = buildUpiLink({ upiId: "shop@okaxis", payeeName: "Ram Avatar", amount: 12050, note: "WB261017-01001" });
    expect(l).toBe("upi://pay?pa=shop%40okaxis&pn=Ram%20Avatar&am=120.50&cu=INR&tn=WB261017-01001");
    expect(() => buildUpiLink({ upiId: "not-an-id", payeeName: "x", amount: 1, note: "x" })).toThrow();
  });
});

describe("create schema", () => {
  it("never accepts prices from the client", () => {
    const r = createBookingSchema.parse({
      customer: { name: "Ab Cd", phone: "9876543210", address: "House 1, Street", city: "Faridabad", pincode: "121006" },
      items: [{ variantId: "00000000-0000-4000-8000-000000000001", quantity: 2, unitPrice: 1 }],
      deliveryDate: "2026-10-17", slotId: "00000000-0000-4000-8000-000000000002", paymentMethod: "cod", idempotencyKey: "abcdefgh12", total: 1,
    });
    expect("total" in r).toBe(false);
    expect("unitPrice" in r.items[0]!).toBe(false);
  });
});
