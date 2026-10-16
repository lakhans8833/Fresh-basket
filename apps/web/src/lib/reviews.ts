import "server-only";
import { query, queryOne, tx } from "./db";
import { conflict, forbidden, notFound } from "./http";

export type ReviewStatus = "pending" | "approved" | "hidden";

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  /** First name only (or "Customer"), never the email or full name. */
  author: string;
  createdAt: string;
}

export interface ReviewSummary {
  /** Average of approved reviews, 1 decimal; null when there are none. */
  average: number | null;
  count: number;
  reviews: PublicReview[];
}

const firstName = (full: string | null) => full?.trim().split(/\s+/)[0]?.slice(0, 30) || "Customer";
const iso = (d: Date | string) => new Date(d).toISOString();

/** Approved reviews of a product (newest first) with the real average and count. */
export async function getProductReviews(productId: string, limit = 30): Promise<ReviewSummary> {
  const [agg, rows] = await Promise.all([
    queryOne<{ avg: string | null; n: number }>(
      "select round(avg(rating)::numeric, 1)::text as avg, count(*)::int as n from product_reviews where product_id = $1 and status = 'approved'",
      [productId],
    ),
    query<{ id: string; rating: number; comment: string | null; full_name: string | null; created_at: Date }>(
      `select r.id, r.rating, r.comment, p.full_name, r.created_at
         from product_reviews r join profiles p on p.id = r.user_id
        where r.product_id = $1 and r.status = 'approved'
        order by r.created_at desc limit $2`,
      [productId, limit],
    ),
  ]);
  const count = agg?.n ?? 0;
  return {
    average: count > 0 && agg?.avg ? Number(agg.avg) : null,
    count,
    reviews: rows.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, author: firstName(r.full_name), createdAt: iso(r.created_at) })),
  };
}

/** The customer's most recent DELIVERED order that contains this product, if any. */
async function deliveredOrderWith(userId: string, productId: string) {
  return queryOne<{ id: string }>(
    `select o.id from orders o
      where o.user_id = $1 and o.status = 'delivered'
        and exists (select 1 from order_items i where i.order_id = o.id and i.product_id = $2)
      order by o.created_at desc limit 1`,
    [userId, productId],
  );
}

export interface ReviewEligibility {
  canReview: boolean;
  /** Why not, in plain words (shown to the customer). */
  reason: string | null;
  mine: { rating: number; comment: string | null; status: ReviewStatus } | null;
}

export async function reviewEligibility(userId: string, productId: string): Promise<ReviewEligibility> {
  const [order, mine] = await Promise.all([
    deliveredOrderWith(userId, productId),
    queryOne<{ rating: number; comment: string | null; status: ReviewStatus }>(
      "select rating, comment, status from product_reviews where product_id = $1 and user_id = $2",
      [productId, userId],
    ),
  ]);
  return {
    canReview: Boolean(order),
    reason: order ? null : "You can review this after an order with it has been delivered to you.",
    mine,
  };
}

/** Create or update the customer's review. Only after a delivered order; goes back to "pending" for approval. */
export async function submitReview(userId: string, productId: string, rating: number, comment: string | null) {
  const product = await queryOne<{ id: string }>("select id from products where id = $1", [productId]);
  if (!product) throw notFound("Product not found.");
  const order = await deliveredOrderWith(userId, productId);
  if (!order) throw forbidden("You can review this after an order with it has been delivered to you.");
  const r = await queryOne<{ id: string; status: ReviewStatus }>(
    `insert into product_reviews (product_id, user_id, order_id, rating, comment)
     values ($1, $2, $3, $4, $5)
     on conflict (product_id, user_id) do update
       set rating = excluded.rating, comment = excluded.comment, order_id = excluded.order_id,
           status = 'pending', updated_at = now()
     returning id, status`,
    [productId, userId, order.id, rating, comment?.trim() ? comment.trim() : null],
  );
  return r!;
}

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  productName: string;
  productSlug: string;
  customerName: string | null;
  customerEmail: string | null;
  orderNumber: string | null;
}

export async function adminListReviews(status?: string | null): Promise<AdminReview[]> {
  const params: unknown[] = [];
  let where = "";
  if (status === "pending" || status === "approved" || status === "hidden") {
    params.push(status);
    where = "where r.status = $1";
  }
  const rows = await query<{
    id: string; rating: number; comment: string | null; status: ReviewStatus; created_at: Date; updated_at: Date;
    product_name: string; product_slug: string; full_name: string | null; email: string | null; order_number: string | null;
  }>(
    `select r.id, r.rating, r.comment, r.status, r.created_at, r.updated_at, p.name as product_name, p.slug as product_slug,
            pr.full_name, pr.email, o.order_number
       from product_reviews r
       join products p on p.id = r.product_id
       join profiles pr on pr.id = r.user_id
       left join orders o on o.id = r.order_id
       ${where}
      order by (r.status = 'pending') desc, r.updated_at desc
      limit 300`,
    params,
  );
  return rows.map((r) => ({
    id: r.id, rating: r.rating, comment: r.comment, status: r.status, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    productName: r.product_name, productSlug: r.product_slug, customerName: r.full_name, customerEmail: r.email, orderNumber: r.order_number,
  }));
}

export async function adminSetReviewStatus(id: string, status: ReviewStatus, seenUpdatedAt?: string) {
  return tx(async (c) => {
    const cur = await c.query<{ updated_at: Date }>("select updated_at from product_reviews where id = $1 for update", [id]);
    if (!cur.rows[0]) throw notFound("Review not found.");
    // Compare at millisecond precision (the admin page received an ISO string).
    if (seenUpdatedAt && cur.rows[0].updated_at.getTime() !== new Date(seenUpdatedAt).getTime()) {
      throw conflict("The customer changed this review just now. Please read the new text and try again.");
    }
    const { rows } = await c.query<{ id: string; updated_at: Date }>(
      "update product_reviews set status = $2, updated_at = now() where id = $1 returning id, updated_at",
      [id, status],
    );
    if (!rows[0]) throw notFound("Review not found.");
    return { id, status, updatedAt: iso(rows[0].updated_at) };
  });
}

export async function pendingReviewCount(): Promise<number> {
  return (await queryOne<{ n: number }>("select count(*)::int as n from product_reviews where status = 'pending'"))?.n ?? 0;
}
