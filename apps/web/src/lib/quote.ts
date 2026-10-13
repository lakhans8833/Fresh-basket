import "server-only";
import type { PoolClient } from "pg";
import {
  computeQuote, describeIssue, formatINR,
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
}

type VariantRow = {
  id: string; label: string; price: number; stock: number; active: boolean;
  product_id: string; product_name: string; product_active: boolean; image_url: string | null;
};
type CouponRow = {
  id: string; code: string; kind: "percent" | "flat"; value: number; min_order: number; max_discount: number | null;
  starts_at: Date | null; ends_at: Date | null; usage_limit: number | null; per_user_limit: number | null; used_count: number; active: boolean;
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

  const { rows: vrows } = ids.length
    ? await db.query<VariantRow>(
        `select v.id, v.label, v.price, v.stock, v.active, p.id as product_id, p.name as product_name,
                (p.active and c.active) as product_active,
                (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
           from product_variants v join products p on p.id = v.product_id join categories c on c.id = p.category_id
          where v.id = any($1::uuid[]) order by v.id ${lock}`,
        [ids],
      )
    : { rows: [] as VariantRow[] };
  const byId = new Map(vrows.map((r) => [r.id, r]));

  const lines: PricedLineInput[] = ids.map((id) => {
    const r = byId.get(id);
    return r
      ? { variantId: id, productName: r.product_name, variantLabel: r.label, unitPrice: r.price, quantity: qty.get(id)!, stock: r.stock, active: r.active && r.product_active }
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
      couponId = c.id;
      coupon = {
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
    delivery: area ? { fee: area.fee, freeAbove: area.freeAbove, minOrder: Math.max(area.minOrder, globalMin) } : null,
    deliveryRequired: opts.deliveryRequired ?? Boolean(input.pincode),
  });
  if (!quote.couponCode) couponId = null;

  const variants = new Map(
    vrows.map((r) => [r.id, { productId: r.product_id, productName: r.product_name, label: r.label, imageUrl: r.image_url }]),
  );
  return { quote, area, couponId, variants };
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
  return { quote: ctx.quote, messages: quoteMessages(ctx.quote), area: ctx.area };
}
