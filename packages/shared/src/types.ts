import type { Paise } from "./money";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "./orderStatus";
import type { Quote } from "./pricing";

/** Shapes returned by the HTTP API (apps/web/src/app/api). Shared by web and mobile. */

export interface StoreSettings {
  storeName: string;
  tagline: string;
  logoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  whatsapp: string | null;
  address: string | null;
  supportHours: string | null;
  social: { instagram: string | null; facebook: string | null; youtube: string | null; x: string | null };
  codEnabled: boolean;
  /** Which online gateway is usable right now. "mock" only in development. */
  onlinePayment: "razorpay" | "mock" | null;
  defaultMinOrder: Paise;
  slotDaysAhead: number;
  announcement: string | null;
  /** Store UPI ID for UPI payments (verified by staff); null = UPI not offered. */
  upiId: string | null;
  upiPayeeName: string | null;
  /** Optional QR image uploaded in Admin → Settings. */
  upiQrUrl: string | null;
  /** Razorpay Payment Links can be created (Razorpay keys configured on the server). */
  paymentLinks: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount?: number;
}

export interface Variant {
  id: string;
  label: string; // "500 g"
  price: Paise;
  mrp: Paise | null;
  stock: number;
  active: boolean;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  seasonal: boolean;
  featured: boolean;
  variants: Variant[];
  /** min variant price, for sorting/display */
  fromPrice: Paise;
  inStock: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  highlights: string[];
  /** Owner-entered product information; null when not filled in. */
  storageTips: string | null;
  shelfLife: string | null;
  origin: string | null;
  /** Nutrition notes entered in Admin (plain text, may have line breaks). */
  nutrition: string | null;
  images: { id: string; url: string; alt: string | null }[];
  categorySlug: string;
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface PromoBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string;
  theme: "green" | "lime" | "amber" | "ivory";
}

export interface DeliveryArea {
  id: string;
  pincode: string;
  areaName: string;
  city: string;
  fee: Paise;
  freeAbove: Paise | null;
  minOrder: Paise;
  active: boolean;
}

export interface SlotOption {
  slotId: string;
  date: string; // YYYY-MM-DD (IST)
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: "customer" | "staff" | "admin";
}

export interface OrderItem {
  variantId: string | null;
  productId: string | null;
  productName: string;
  variantLabel: string;
  unitPrice: Paise;
  quantity: number;
  lineTotal: Paise;
  imageUrl: string | null;
}

export interface OrderEvent {
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: Paise;
  discount: Paise;
  couponCode: string | null;
  deliveryFee: Paise;
  total: Paise;
  deliveryDate: string;
  slotLabel: string;
  address: Omit<Address, "id" | "isDefault" | "label"> & { label?: string };
  items: OrderItem[];
  events: OrderEvent[];
  createdAt: string;
  reservationExpiresAt: string | null;
  customerNote: string | null;
  /** "web" checkout or "whatsapp" order. */
  channel: "web" | "whatsapp";
  /** UTR the customer reported for a UPI payment (not proof of payment). */
  upiReference: string | null;
  /** Razorpay Payment Link for this order (while payment is pending). */
  paymentLinkUrl: string | null;
  /** Customer agreed to WhatsApp order updates. */
  whatsappUpdates: boolean;
}

export interface QuoteResponse {
  quote: Quote;
  messages: Record<string, string>; // variantId or "_cart" -> human message
  area: DeliveryArea | null;
  /** Free-delivery amount shared by every active delivery area (shown before a PIN code is chosen); null if they differ or none is set. */
  commonFreeAbove?: number | null;
}

export interface PlaceOrderResponse {
  order: Order;
  /** present for online payments */
  payment?:
    | { provider: "razorpay"; keyId: string; razorpayOrderId: string; amount: Paise; currency: "INR"; payUrl: string }
    | { provider: "mock"; payUrl: string };
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
