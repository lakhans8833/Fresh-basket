import type { Metadata } from "next";
import { listMyOrders } from "@/lib/orders";
import { requireAccountSession } from "../require-session";
import { OrderHistory } from "@/components/account/order-history";

export const metadata: Metadata = { title: "Your orders" };

export default async function OrdersPage() {
  const { userId } = await requireAccountSession("/account/orders");
  const orders = await listMyOrders(userId);
  return (
    <section aria-labelledby="orders-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="orders-heading" className="text-2xl font-semibold text-forest-900">Orders</h1>
        {orders.length ? <p className="text-sm text-muted">{orders.length === 50 ? "Your 50 most recent orders" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}</p> : null}
      </div>
      <OrderHistory orders={orders} />
    </section>
  );
}
