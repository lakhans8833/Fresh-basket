import { json, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { reorderItems } from "@/lib/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const s = await requireUser();
  return json(await reorderItems(s.userId, (await params).id));
});
