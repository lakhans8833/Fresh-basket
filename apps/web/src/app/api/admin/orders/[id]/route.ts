import { z } from "zod";
import { adminOrderStatusSchema, PAYMENT_STATUSES, upiReferenceSchema } from "@freshbasket/shared";
import { badRequest, forbidden, json, parseBody, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminConfirmUpiPayment } from "@/lib/payments/upi";
import { adminGetOrder, adminUpdateOrderStatus, adminUpdatePaymentStatus } from "@/lib/admin/orders";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireStaff();
  return json({ order: await adminGetOrder((await params).id) });
});

const patchSchema = z.union([
  adminOrderStatusSchema,
  z.object({ paymentStatus: z.enum(PAYMENT_STATUSES) }),
  // "I checked our bank / UPI app: this UTR's money for the full order amount has arrived."
  z.object({ confirmUpi: upiReferenceSchema.extend({ amountReceived: z.literal(true) }) }),
]);

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const s = await requireStaff();
  const id = (await params).id;
  const body = await parseBody(req, patchSchema);
  if ("status" in body) return json({ order: await adminUpdateOrderStatus(id, body.status, s.userId, body.note) });
  if ("paymentStatus" in body) return json({ order: await adminUpdatePaymentStatus(id, body.paymentStatus, s.userId) });
  if ("confirmUpi" in body) {
    // Marking money as received is an admin decision (staff can see orders but not confirm payments).
    if (s.profile.role !== "admin") throw forbidden("Only an admin can confirm UPI payments.");
    const { result } = await adminConfirmUpiPayment(id, { id: s.userId, email: s.profile.email }, body.confirmUpi.reference);
    return json({ order: await adminGetOrder(id), result });
  }
  throw badRequest("Nothing to update.");
});
