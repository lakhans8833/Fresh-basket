import { addressInputSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { listAddresses, saveAddress } from "@/lib/account";

export const GET = route(async () => {
  const s = await requireUser();
  return json({ addresses: await listAddresses(s.userId) });
});

export const POST = route(async (req) => {
  const s = await requireUser();
  const body = await parseBody(req, addressInputSchema);
  return json({ address: await saveAddress(s.userId, null, body) }, { status: 201 });
});
