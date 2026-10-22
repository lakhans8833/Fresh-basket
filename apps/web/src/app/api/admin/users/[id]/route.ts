import { z } from "zod";
import { badRequest, json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminConfirmEmail, adminCreateResetLink, adminResendConfirmation, adminSetPassword, adminSetRole, adminUpdateUser } from "@/lib/admin/users";
import { phoneSchema } from "@freshbasket/shared";

const roleSchema = z.object({ role: z.enum(["customer", "staff", "admin"]) });
/** Edit details: name, mobile and sign-in email. */
const detailsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter a name (at least 2 characters)").max(80),
  phone: phoneSchema.nullable(),
  email: z.email("Enter a valid email address").max(160),
});
const schema = z.union([roleSchema, detailsSchema]);

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const me = await requireAdmin();
  const id = (await params).id;
  if (!z.string().uuid().safeParse(id).success) throw badRequest("Invalid user id.");
  const body = await parseBody(req, schema);
  if ("role" in body) return json(await adminSetRole(me.userId, id, body.role));
  return json({ user: await adminUpdateUser(id, body) });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm-email") }),
  z.object({ action: z.literal("resend-confirmation") }),
  z.object({ action: z.literal("reset-link") }),
  z.object({ action: z.literal("set-password"), password: z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters") }),
]);

/** Email and password actions: confirm / resend sign-up email, password reset link, set a new password. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const me = await requireAdmin();
  const id = (await params).id;
  if (!z.string().uuid().safeParse(id).success) throw badRequest("Invalid user id.");
  const body = await parseBody(req, actionSchema);
  switch (body.action) {
    case "confirm-email": return json(await adminConfirmEmail(id));
    case "resend-confirmation": return json(await adminResendConfirmation(id));
    case "reset-link": return json(await adminCreateResetLink(me.userId, id, new URL(req.url).origin));
    case "set-password": return json(await adminSetPassword(me.userId, id, body.password));
  }
});
