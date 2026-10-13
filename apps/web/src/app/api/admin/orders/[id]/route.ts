import { z } from "zod";
import { adminOrderStatusSchema, PAYMENT_STATUSES } from "@freshbasket/shared";
import { badRequest, json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminGetOrder, adminUpdateOrderStatus, adminUpdatePaymentStatus } from "@/lib/admin/orders";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireStaff();
  return json({ order: await adminGetOrder((await params).id) });
});

const patchSchema = z.union([adminOrderStatusSchema, z.object({ paymentStatus: z.enum(PAYMENT_STATUSES) })]);

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const s = await requireStaff();
  const id = (await params).id;
  const body = await parseBody(req, patchSchema);
  if ("status" in body) return json({ order: await adminUpdateOrderStatus(id, body.status, s.userId, body.note) });
  if ("paymentStatus" in body) return json({ order: await adminUpdatePaymentStatus(id, body.paymentStatus, s.userId) });
  throw badRequest("Nothing to update.");
});
