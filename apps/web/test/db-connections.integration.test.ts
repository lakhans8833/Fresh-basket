/**
 * Database connection use (4 Nov 2026 audit): production logged pg's "client.query() while the client
 * is already executing a query" deprecation on /account and /api/orders, and once the Supabase pooler's
 * "EMAXCONN max client connections reached" during a burst of page loads.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { isConnectionError, isPoolFull, pool } from "@/lib/db";
import { hydrateOrders } from "@/lib/orders";

afterAll(async () => {
  await pool.end();
});

describe("order details are loaded one query at a time", () => {
  it("never overlaps queries on one client", async () => {
    const row = {
      id: "00000000-0000-4000-8000-00000000d001", order_number: "FB-TEST", user_id: null, status: "placed", payment_method: "cod",
      payment_status: "cod_pending", subtotal: 100, discount: 0, coupon_code: null, delivery_fee: 0, total: 100, delivery_date: "2026-11-05",
      slot_label: "Evening", address: {}, customer_note: null, unavailable_item_preference: null, reservation_expires_at: null,
      razorpay_order_id: null, created_at: new Date(), channel: "web", upi_reference: null, razorpay_payment_link_url: null, whatsapp_updates: false,
    };
    let running = 0;
    let most = 0;
    let calls = 0;
    const client = {
      query: async () => {
        running++;
        calls++;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
        return { rows: [] };
      },
    } as unknown as Pick<PoolClient, "query">;
    const orders = await hydrateOrders(client, [row] as never);
    expect(orders).toHaveLength(1);
    expect(calls).toBe(3);
    expect(most).toBe(1);
  });
});

describe("a full connection pooler is treated as a passing connection problem", () => {
  it("recognises Supabase's EMAXCONN and Postgres's too-many-clients errors", () => {
    for (const message of ["(EMAXCONN) max client connections reached, limit: 200", "sorry, too many clients already"]) {
      expect(isPoolFull({ message })).toBe(true);
      expect(isConnectionError({ message, code: "XX000" })).toBe(true);
    }
    expect(isPoolFull({ message: 'relation "x" does not exist' })).toBe(false);
  });
});
