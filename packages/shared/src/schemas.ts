import { z } from "zod";
import { MAX_LINES, MAX_QTY_PER_LINE } from "./pricing";
import { isValidIndianMobile, normalizePhone, pincodeStateMessage, PINCODE_REGEX, stateMatchesPincode } from "./pincode";
import { ORDER_STATUSES } from "./orderStatus";

const uuid = z.uuid();
const trimmed = (max: number) => z.string().trim().max(max);

export const pincodeSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(PINCODE_REGEX, "Enter a valid 6-digit PIN code"));

export const phoneSchema = z
  .string()
  .refine(isValidIndianMobile, "Enter a valid 10-digit mobile number")
  .transform(normalizePhone);

export const cartLineSchema = z.object({
  variantId: uuid,
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE),
});

export const quoteRequestSchema = z.object({
  items: z.array(cartLineSchema).max(MAX_LINES),
  couponCode: trimmed(32).toUpperCase().optional().nullable(),
  pincode: pincodeSchema.optional().nullable(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const addressInputSchema = z.object({
  label: trimmed(30).min(1).default("Home"),
  fullName: trimmed(80).min(2, "Enter the recipient's name"),
  phone: phoneSchema,
  line1: trimmed(160).min(3, "Enter house / flat and street"),
  line2: trimmed(160).optional().nullable(),
  landmark: trimmed(120).optional().nullable(),
  city: trimmed(60).min(2, "Enter city"),
  state: trimmed(60).min(2, "Enter state"),
  pincode: pincodeSchema,
  isDefault: z.boolean().optional().default(false),
}).superRefine((a, ctx) => {
  // e.g. "New Delhi, Delhi" with PIN 121006 (Faridabad, Haryana) — the delivery partner would go to the wrong place.
  if (!stateMatchesPincode(a.state, a.pincode)) ctx.addIssue({ code: "custom", path: ["state"], message: pincodeStateMessage(a.pincode) });
});
export type AddressInput = z.infer<typeof addressInputSchema>;

export const placeOrderSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(MAX_LINES),
  couponCode: trimmed(32).toUpperCase().optional().nullable(),
  addressId: uuid.optional(),
  address: addressInputSchema.optional(),
  saveAddress: z.boolean().optional().default(false),
  slotId: uuid,
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(["cod", "razorpay", "mock"]),
  customerNote: trimmed(300).optional().nullable(),
  /** Client-generated key so a double-click or retry never creates two orders. */
  idempotencyKey: z.string().min(8).max(80),
}).refine((v) => v.addressId || v.address, { message: "Choose or enter a delivery address", path: ["address"] });
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const profileUpdateSchema = z.object({
  fullName: trimmed(80).min(2),
  phone: phoneSchema.optional().nullable(),
});

export const newsletterSchema = z.object({ email: z.email().max(160) });

export const contactSchema = z.object({
  name: trimmed(80).min(2, "Enter your name"),
  email: z.email("Enter a valid email").max(160),
  phone: z.string().optional().nullable(),
  orderNumber: trimmed(40).optional().nullable(),
  message: trimmed(2000).min(10, "Tell us a little more (10+ characters)"),
});

export const razorpayVerifySchema = z.object({
  orderId: uuid,
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(16).max(256),
});

/* ---------- Admin ---------- */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const adminCategorySchema = z.object({
  name: trimmed(60).min(2),
  slug,
  description: trimmed(200).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

/** Offer banner (Admin → Banners). Links are internal paths only, e.g. "/deals". */
export const BANNER_THEMES = ["green", "lime", "amber", "ivory"] as const;
export const adminBannerSchema = z
  .object({
    title: trimmed(60).min(2),
    subtitle: trimmed(120).optional().nullable(),
    imageUrl: z.string().max(500).optional().nullable(),
    linkUrl: z
      .string()
      .trim()
      .max(200)
      .regex(/^\/(?![\/\\])\S*$/, "Use a page on this website, starting with / (e.g. /deals)"),
    theme: z.enum(BANNER_THEMES).default("green"),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(999).default(0),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .refine((b) => !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt), { path: ["endsAt"], message: "End must be after start" });
export type AdminBannerInput = z.infer<typeof adminBannerSchema>;

export const adminVariantSchema = z.object({
  id: uuid.optional(),
  label: trimmed(30).min(1),
  price: z.number().int().min(0).max(10_000_000),
  mrp: z.number().int().min(0).max(10_000_000).optional().nullable(),
  stock: z.number().int().min(0).max(1_000_000),
  sortOrder: z.number().int().min(0).max(99).default(0),
  active: z.boolean().default(true),
});

export const adminProductSchema = z.object({
  name: trimmed(80).min(2),
  slug,
  categoryId: uuid,
  description: trimmed(2000).optional().nullable(),
  highlights: z.array(trimmed(40).min(1)).max(6).default([]),
  /** Optional product information. Leave out to keep what's saved; send null or "" to clear. */
  storageTips: trimmed(200).nullable().optional(),
  shelfLife: trimmed(60).nullable().optional(),
  origin: trimmed(60).nullable().optional(),
  seasonal: z.boolean().default(false),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  images: z.array(z.object({ url: z.string().min(1).max(500), alt: trimmed(120).optional().nullable() })).max(8).default([]),
  variants: z.array(adminVariantSchema).min(1, "Add at least one weight option").max(10),
});
export type AdminProductInput = z.infer<typeof adminProductSchema>;

export const adminInventoryPatchSchema = z.object({
  updates: z
    .array(z.object({ variantId: uuid, price: z.number().int().min(0).optional(), stock: z.number().int().min(0).optional(), active: z.boolean().optional() }))
    .min(1)
    .max(200),
});

export const adminOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: trimmed(300).optional().nullable(),
});

export const adminDeliveryAreaSchema = z.object({
  pincode: pincodeSchema,
  areaName: trimmed(80).min(2),
  city: trimmed(60).min(2),
  fee: z.number().int().min(0).max(100_000),
  freeAbove: z.number().int().min(0).optional().nullable(),
  minOrder: z.number().int().min(0).max(10_000_000),
  active: z.boolean().default(true),
});

export const adminSlotSchema = z
  .object({
    label: trimmed(40).min(2),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    cutoffMinutes: z.number().int().min(0).max(24 * 60),
    capacity: z.number().int().min(1).max(10_000),
    sortOrder: z.number().int().min(0).max(99).default(0),
    active: z.boolean().default(true),
  })
  .refine((s) => s.startTime < s.endTime, { message: "End time must be after start time", path: ["endTime"] });

export const adminCouponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,32}$/, "3–32 letters/numbers"),
    description: trimmed(160).optional().nullable(),
    kind: z.enum(["percent", "flat"]),
    value: z.number().int().min(1),
    minOrder: z.number().int().min(0).default(0),
    maxDiscount: z.number().int().min(0).optional().nullable(),
    startsAt: z.string().optional().nullable(),
    endsAt: z.string().optional().nullable(),
    usageLimit: z.number().int().min(1).optional().nullable(),
    perUserLimit: z.number().int().min(1).optional().nullable(),
    firstOrderOnly: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((c) => c.kind !== "percent" || c.value <= 100, { message: "Percent must be 1–100", path: ["value"] });

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https:\/\//.test(v), "Must start with https://");

export const adminSettingsSchema = z.object({
  storeName: trimmed(60).min(2),
  tagline: trimmed(120).default(""),
  logoUrl: z.string().max(500).optional().nullable(),
  supportPhone: trimmed(20).optional().nullable(),
  supportEmail: z.union([z.email(), z.literal("")]).optional().nullable(),
  whatsapp: trimmed(20).optional().nullable(),
  address: trimmed(300).optional().nullable(),
  supportHours: trimmed(120).optional().nullable(),
  instagram: optionalUrl,
  facebook: optionalUrl,
  youtube: optionalUrl,
  x: optionalUrl,
  codEnabled: z.boolean(),
  defaultMinOrder: z.number().int().min(0),
  slotDaysAhead: z.number().int().min(1).max(14),
  announcement: trimmed(160).optional().nullable(),
});
