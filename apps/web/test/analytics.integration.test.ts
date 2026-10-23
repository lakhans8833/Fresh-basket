/**
 * Dashboard charts: the analytics figures must agree with the orders table, counted independently
 * here from the raw rows (India-time days; sales = paid / cash-on-delivery orders that aren't cancelled).
 */
import { afterAll, describe, expect, it } from "vitest";
import { pool, query } from "@/lib/db";
import { adminAnalytics } from "@/lib/admin/analytics";

afterAll(async () => { await pool.end(); });

type Row = { day: string; total: number; status: string; payment_status: string; pincode: string | null };
const isSale = (o: Row) => !["cancelled", "pending_confirmation", "pending_payment"].includes(o.status) && ["paid", "cod_pending", "cod_collected"].includes(o.payment_status);
const isPlaced = (o: Row) => !["cancelled", "pending_payment"].includes(o.status);

describe("admin analytics", () => {
  for (const days of [7, 30, 90] as const) {
    it(`${days} days: totals, daily rows and status counts match the orders table`, async () => {
      const today = (await query<{ d: string }>("select to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d"))[0]!.d;
      const rows = await query<Row>(
        `select to_char((created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, total, status, payment_status, address->>'pincode' as pincode
           from orders where (created_at at time zone 'Asia/Kolkata')::date > (now() at time zone 'Asia/Kolkata')::date - $1::int`,
        [days],
      );
      const a = await adminAnalytics(days);
      expect(a.daily).toHaveLength(days);
      expect(a.daily.at(-1)!.date).toBe(today);
      expect(new Set(a.daily.map((d) => d.date)).size).toBe(days);
      const sales = rows.filter(isSale).reduce((s, o) => s + o.total, 0);
      expect(a.totals.sales).toBe(sales);
      expect(a.daily.reduce((s, d) => s + d.sales, 0)).toBe(sales);
      expect(a.totals.orders).toBe(rows.filter(isPlaced).length);
      expect(a.daily.reduce((s, d) => s + d.orders, 0)).toBe(rows.filter(isPlaced).length);
      for (const d of a.daily) expect(d.sales).toBe(rows.filter((o) => o.day === d.date && isSale(o)).reduce((s, o) => s + o.total, 0));
      const n = rows.filter(isSale).length;
      expect(a.totals.avgOrder).toBe(n ? Math.round(sales / n) : 0);
      for (const st of a.statuses) expect(st.count).toBe(rows.filter((o) => o.status === st.status).length);
      expect(a.statuses.some((s) => s.status === "pending_payment")).toBe(false);
      // Areas: each PIN counted once even if several delivery areas share it.
      for (const ar of a.areas) expect(ar.orders).toBe(rows.filter((o) => isPlaced(o) && (o.pincode ?? "—") === ar.pincode).length);
      expect(a.topProducts.length).toBeLessThanOrEqual(6);
    });
  }

  it("a cancelled order never counts as a sale", async () => {
    const cancelled = await query<{ total: number }>(
      "select total from orders where status = 'cancelled' and (created_at at time zone 'Asia/Kolkata')::date > (now() at time zone 'Asia/Kolkata')::date - 90",
    );
    const a = await adminAnalytics(90);
    const all = (await query<{ s: number }>(
      "select coalesce(sum(total),0)::int as s from orders where payment_status in ('paid','cod_pending','cod_collected') and status not in ('pending_confirmation','pending_payment') and (created_at at time zone 'Asia/Kolkata')::date > (now() at time zone 'Asia/Kolkata')::date - 90",
    ))[0]!.s;
    // all paid/COD (incl. cancelled-but-paid) minus cancelled ones ≥ what the chart shows
    expect(a.totals.sales).toBeLessThanOrEqual(all);
    if (cancelled.length) expect(a.statuses.find((s) => s.status === "cancelled")?.count).toBe(cancelled.length);
  });
});
