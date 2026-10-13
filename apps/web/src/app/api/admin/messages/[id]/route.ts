import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminSetMessageStatus } from "@/lib/admin/config";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireStaff();
  const { status } = await parseBody(req, z.object({ status: z.enum(["open", "closed"]) }));
  await adminSetMessageStatus((await params).id, status);
  return json({ ok: true });
});
