import { z } from "zod";
import { badRequest, json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminConfirmEmail, adminResendConfirmation, adminSetRole } from "@/lib/admin/users";

const schema = z.object({ role: z.enum(["customer", "staff", "admin"]) });

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const me = await requireAdmin();
  const id = (await params).id;
  if (!z.string().uuid().safeParse(id).success) throw badRequest("Invalid user id.");
  const { role } = await parseBody(req, schema);
  return json(await adminSetRole(me.userId, id, role));
});

const actionSchema = z.object({ action: z.enum(["confirm-email", "resend-confirmation"]) });

/** Email actions for users who never confirmed their sign-up email. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  const id = (await params).id;
  if (!z.string().uuid().safeParse(id).success) throw badRequest("Invalid user id.");
  const { action } = await parseBody(req, actionSchema);
  return json(action === "confirm-email" ? await adminConfirmEmail(id) : await adminResendConfirmation(id));
});
