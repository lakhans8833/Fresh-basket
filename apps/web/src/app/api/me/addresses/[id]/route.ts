import { addressInputSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { deleteAddress, saveAddress } from "@/lib/account";

export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const s = await requireUser();
  const body = await parseBody(req, addressInputSchema);
  return json({ address: await saveAddress(s.userId, (await params).id, body) });
});

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const s = await requireUser();
  await deleteAddress(s.userId, (await params).id);
  return json({ ok: true });
});
