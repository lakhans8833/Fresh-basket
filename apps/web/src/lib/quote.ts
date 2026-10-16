import "server-only";
import type { PoolClient } from "pg";
import {
  computeQuote, describeIssue, effectiveMinOrder, formatINR,
  type CouponRule, type DeliveryArea, type PricedLineInput, type Quote, type QuoteResponse,
} from "@freshbasket/shared";
import { pool } from "./db";
import { getArea, getDefaultMinOrder } from "./delivery";

type Q = Pick<PoolClient, "query">;

export interface QuoteContext {
  quote: Quote;
  area: DeliveryArea | null;
  couponId: string | null;
  variants: Map<string, { productId: string; productName: string; label: string; imageUrl: string | null }>;
  /** Store-wide minimum (applies before a PIN code is known, and as a floor for every area). */
  storeMinOrder: number;
}

type VariantRow = {
  id: string; label: string; price: number; stock: number; active: boolean;
  product_id: string; product_name: string; product_active: boolean; image_url: string | null;
  /** Product total for stock-by-weight products (pg bigint arrives as a string), else null. */
  stock_grams: string | number | null; grams: number | null;
};
type CouponRow = {
  id: string; code: string; kind: "percent" | "flat"; value: number; min_order: number; max_discount: number | null;
  starts_at: Date | null; ends_at: Date | null; usage_limit: number | null; per_user_limit: number | null; used_count: number; active: boolean;
  first_order_only?: boolean;
};

/**
 * Loads current prices/stock/coupon/delivery rules from the database and computes the
 * order total. With `lock: true` (inside a transaction) the variant and coupon rows are
 * locked FOR UPDATE so the values cannot change before the order is written.
 */
export async function buildQuote(
  input: { items: { variantId: string; quantity: number }[]; couponCode?: string | null; pincode?: string | null },
  opts: { userId?: string | null; db?: Q; lock?: boolean; deliveryRequired?: boolean } = {},
): Promise<QuoteContext> {
  const db = opts.db ?? pool;
  const lock = opts.lock ? "for update of v" : "";
  // Merge duplicate lines defensively.
  const qty = new Map<string, number>();
  for (const it of input.items) qty.set(it.variantId, (qty.get(it.variantId) ?? 0) + it.quantity);
  const ids = [...qty.keys()].sort(); // consistent lock order avoids deadlocks

  // Lock order everywhere: products first, then their packs (take_stock / return_stock and the
  // stock-by-weight triggers update a product's packs while holding the product row).
  if (opts.lock && ids.length) {
    await db.query(
      `select p.id from products p where p.id in (select product_id from product_variants where id = any($1::uuid[])) order by p.id for update`,
      [ids],
    );
  }
  const { rows: vrows } = ids.length
    ? await db.query<VariantRow>(
        `select v.id, v.label, v.price, v.stock, v.active, p.id as product_id, p.name as product_name,
                p.stock_grams, pack_label_grams(v.label) as grams,
                (p.active and c.active) as product_active,
                (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
           from product_variants v join products p on p.id = v.product_id join categories c on c.id = p.category_id
          where v.id = any($1::uuid[]) order by v.id ${lock}`,
        [ids],
      )
    : { rows: [] as VariantRow[] };
  const byId = new Map(vrows.map((r) => [r.id, r]));

  // Stock by weight: several pack sizes of one product share its total grams. Each line may use
  // what the OTHER lines of the same product leave (e.g. 20 kg total, 15 × 1 kg in the cart → at
  // most 10 × 500 g). Every line passes exactly when the product's total fits, so an oversized
  // basket flags each size involved (not just whichever line happened to come last).
  const gramsInBasket = new Map<string, number>();
  for (const r of vrows) {
    if (r.stock_grams !== null && r.stock_grams !== undefined && r.grams) {
      gramsInBasket.set(r.product_id, (gramsInBasket.get(r.product_id) ?? 0) + qty.get(r.id)! * r.grams);
    }
  }
  const linesPerProduct = new Map<string, number>();
  for (const r of vrows) linesPerProduct.set(r.product_id, (linesPerProduct.get(r.product_id) ?? 0) + 1);
  const isShared = (r: VariantRow) => r.stock_grams !== null && r.stock_grams !== undefined && Boolean(r.grams);
  const available = (r: VariantRow): number => {
    if (!isShared(r)) return r.stock;
    const others = (gramsInBasket.get(r.product_id) ?? 0) - qty.get(r.id)! * r.grams!;
    return Math.max(0, Math.floor((Number(r.stock_grams) - others) / r.grams!));
  };

  const lines: PricedLineInput[] = ids.map((id) => {
    const r = byId.get(id);
    return r
      ? { variantId: id, productName: r.product_name, variantLabel: r.label, unitPrice: r.price, quantity: qty.get(id)!, stock: available(r), active: r.active && r.product_active,
          sharedStock: isShared(r) && (linesPerProduct.get(r.product_id) ?? 0) > 1 }
      : { variantId: id, productName: "Unavailable item", variantLabel: "", unitPrice: 0, quantity: qty.get(id)!, stock: 0, active: false };
  });

  let coupon: CouponRule | null = null;
  let couponId: string | null = null;
  const code = input.couponCode?.trim().toUpperCase() || null;
  if (code) {
    const { rows } = await db.query<CouponRow>(`select * from coupons where code = $1 ${opts.lock ? "for update" : ""}`, [code]);
    const c = rows[0];
    if (c) {
      let usedByUser = 0;
      if (opts.userId && c.per_user_limit !== null) {
        const { rows: u } = await db.query<{ n: string }>(
          "select count(*) as n from coupon_redemptions where coupon_id = $1 and user_id = $2",
          [c.id, opts.userId],
        );
        usedByUser = Number(u[0]?.n ?? 0);
      }
      // First-order coupons: count the customer's earlier orders that weren't cancelled.
      let isFirstOrder: boolean | null = null;
      if (c.first_order_only && opts.userId) {
        const { rows: o } = await db.query<{ n: string }>(
          "select count(*) as n from orders where user_id = $1 and status <> 'cancelled'",
          [opts.userId],
        );
        isFirstOrder = Number(o[0]?.n ?? 0) === 0;
      }
      couponId = c.id;
      coupon = {
        firstOrderOnly: Boolean(c.first_order_only), isFirstOrder,
        code: c.code, kind: c.kind, value: c.value, minOrder: c.min_order, maxDiscount: c.max_discount,
        active: c.active, startsAt: c.starts_at, endsAt: c.ends_at, usageLimit: c.usage_limit,
        usedCount: c.used_count, perUserLimit: c.per_user_limit, usedByUser,
      };
    }
  }

  const area = input.pincode ? await getArea(input.pincode, db) : null;
  const globalMin = await getDefaultMinOrder(db);

  const quote = computeQuote({
    lines,
    coupon,
    couponCodeRequested: code,
    delivery: area ? { fee: area.fee, freeAbove: area.freeAbove, minOrder: effectiveMinOrder(area.minOrder, globalMin) } : null,
    deliveryRequired: opts.deliveryRequired ?? Boolean(input.pincode),
  });
  if (!quote.couponCode) couponId = null;

  const variants = new Map(
    vrows.map((r) => [r.id, { productId: r.product_id, productName: r.product_name, label: r.label, imageUrl: r.image_url }]),
  );
  return { quote, area, couponId, variants, storeMinOrder: globalMin };
}

export function quoteMessages(quote: Quote): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of quote.issues) {
    const key = "variantId" in issue ? issue.variantId : issue.code === "COUPON_INVALID" ? "_coupon" : "_cart";
    out[key] = out[key] ? `${out[key]} ${describeIssue(issue, formatINR)}` : describeIssue(issue, formatINR);
  }
  return out;
}

export function toQuoteResponse(ctx: QuoteContext): QuoteResponse {
  return { quote: ctx.quote, messages: quoteMessages(ctx.quote), area: ctx.area, minOrder: ctx.area ? ctx.area.minOrder : ctx.storeMinOrder };
}
