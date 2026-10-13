import { json, notFound, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getMyOrder } from "@/lib/orders";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const s = await requireUser();
  const order = await getMyOrder(s.userId, (await params).id);
  if (!order) throw notFound("Order not found.");
  return json({ order });
});
