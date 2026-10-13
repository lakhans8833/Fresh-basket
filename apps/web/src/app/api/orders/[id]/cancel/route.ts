import { json, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { customerCancel } from "@/lib/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const s = await requireUser();
  return json({ order: await customerCancel(s.userId, (await params).id) });
});
