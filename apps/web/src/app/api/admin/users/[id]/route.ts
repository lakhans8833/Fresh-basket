import { z } from "zod";
import { badRequest, json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminSetRole } from "@/lib/admin/users";

const schema = z.object({ role: z.enum(["customer", "staff", "admin"]) });

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const me = await requireAdmin();
  const id = (await params).id;
  if (!z.string().uuid().safeParse(id).success) throw badRequest("Invalid user id.");
  const { role } = await parseBody(req, schema);
  return json(await adminSetRole(me.userId, id, role));
});
