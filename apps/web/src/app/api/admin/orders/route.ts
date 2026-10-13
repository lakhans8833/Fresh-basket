import { json, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminListOrders } from "@/lib/admin/orders";

export const GET = route(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  return json({ orders: await adminListOrders({ status: sp.get("status"), q: sp.get("q"), date: sp.get("date") }) });
});
