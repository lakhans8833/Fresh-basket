import { json, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminStats } from "@/lib/admin/orders";

export const GET = route(async () => {
  await requireStaff();
  return json(await adminStats());
});
