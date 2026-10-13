import { conflict, json, notFound, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getMyOrder, getOrderById } from "@/lib/orders";
import { preparePayment } from "@/lib/payments/start";

/** Retry / resume payment for an order still awaiting payment. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const s = await requireUser();
  const id = (await params).id;
  if (!(await getMyOrder(s.userId, id))) throw notFound("Order not found.");
  const order = await getOrderById(id);
  const payment = await preparePayment(order!);
  if (!payment) throw conflict("This order is not awaiting payment.");
  return json({ order, payment });
});
