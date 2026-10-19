import { placeOrderSchema } from "@freshbasket/shared";
import { json, parseBody, rateLimit, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { listMyOrders, placeOrder } from "@/lib/orders";
import { preparePayment } from "@/lib/payments/start";
import { getOrderById } from "@/lib/orders";

export const GET = route(async () => {
  const s = await requireUser();
  return json({ orders: await listMyOrders(s.userId) });
});

export const POST = route(async (req) => {
  const s = await requireUser();
  await rateLimit(`order:${s.userId}`, 10, 60_000);
  const input = await parseBody(req, placeOrderSchema);
  const { order, created } = await placeOrder(s.userId, input);
  const full = await getOrderById(order.id);
  const payment = await preparePayment(full!);
  return json({ order, payment }, { status: created ? 201 : 200 });
});
