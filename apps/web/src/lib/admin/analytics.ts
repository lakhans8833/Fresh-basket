import "server-only";
import { query } from "../db";

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Orders that count as sales: same rule as "Revenue today" on the dashboard. */
const SALE = `o.status not in ('cancelled','pending_confirmation','pending_payment') and o.payment_status in ('paid','cod_pending','cod_collected')`;
/** Orders that were really placed (not abandoned online payments, not cancelled). */
const PLACED = `o.status not in ('cancelled','pending_payment')`;
const IST_DAY = `(o.created_at at time zone 'Asia/Kolkata')::date`;
const IST_TODAY = `(now() at time zone 'Asia/Kolkata')::date`;

export interface Analytics {
  days: number;
  /** One row per India-time day, oldest first, including days without orders. */
  daily: { date: string; sales: number; orders: number }[];
  totals: { sales: number; orders: number; avgOrder: number; items: number };
  previous: { sales: number; orders: number };
  statuses: { status: string; count: number }[];
  topProducts: { name: string; quantity: number; sales: number }[];
  areas: { pincode: string; name: string; orders: number; sales: number }[];
}

/** Read-only sales figures for the dashboard charts (whole India-time days; today included). */
export async function adminAnalytics(days: AnalyticsRange): Promise<Analytics> {
  const from = `${IST_TODAY} - ${days - 1}`;
  const inRange = `${IST_DAY} between ${from} and ${IST_TODAY}`;
  const [daily, totals, previous, statuses, topProducts, areas] = await Promise.all([
    query<{ date: string; sales: number; orders: number }>(
      `select to_char(d, 'YYYY-MM-DD') as date,
              coalesce(sum(o.total) filter (where ${SALE}), 0)::float8 as sales,
              count(o.id) filter (where ${PLACED})::int as orders
         from generate_series(${from}, ${IST_TODAY}, interval '1 day') d
         left join orders o on ${IST_DAY} = d::date
        group by d order by d`,
    ),
    query<{ sales: number; orders: number; items: number }>(
      `select coalesce(sum(o.total) filter (where ${SALE}), 0)::float8 as sales,
              count(*) filter (where ${PLACED})::int as orders,
              coalesce((select sum(i.quantity) from order_items i join orders o2 on o2.id = i.order_id
                         where ${SALE.replaceAll("o.", "o2.")} and (o2.created_at at time zone 'Asia/Kolkata')::date between ${from} and ${IST_TODAY}), 0)::float8 as items
         from orders o where ${inRange}`,
    ),
    query<{ sales: number; orders: number }>(
      `select coalesce(sum(o.total) filter (where ${SALE}), 0)::float8 as sales, count(*) filter (where ${PLACED})::int as orders
         from orders o where ${IST_DAY} between ${from} - ${days} and ${from} - 1`,
    ),
    query<{ status: string; count: number }>(
      `select o.status, count(*)::int as count from orders o where ${inRange} and o.status <> 'pending_payment' group by o.status order by count desc`,
    ),
    query<{ name: string; quantity: number; sales: number }>(
      `select i.product_name as name, sum(i.quantity)::float8 as quantity, sum(i.line_total)::float8 as sales
         from order_items i join orders o on o.id = i.order_id
        where ${SALE} and ${inRange}
        group by i.product_name order by sales desc, quantity desc limit 6`,
    ),
    query<{ pincode: string; name: string; orders: number; sales: number }>(
      `select coalesce(o.address->>'pincode', '—') as pincode,
              coalesce(max(a.area_name), max(o.address->>'city'), '') as name,
              count(*)::int as orders, coalesce(sum(o.total) filter (where ${SALE}), 0)::float8 as sales
         from orders o left join lateral (select area_name from delivery_areas d where d.pincode = o.address->>'pincode' order by d.active desc limit 1) a on true
        where ${PLACED} and ${inRange}
        group by 1 order by orders desc, sales desc limit 6`,
    ),
  ]);
  const t = totals[0] ?? { sales: 0, orders: 0, items: 0 };
  const salesOrders = await query<{ n: number }>(`select count(*)::int as n from orders o where ${SALE} and ${inRange}`);
  const n = salesOrders[0]?.n ?? 0;
  return {
    days,
    daily,
    totals: { sales: t.sales, orders: t.orders, items: t.items, avgOrder: n ? Math.round(t.sales / n) : 0 },
    previous: previous[0] ?? { sales: 0, orders: 0 },
    statuses,
    topProducts,
    areas,
  };
}
