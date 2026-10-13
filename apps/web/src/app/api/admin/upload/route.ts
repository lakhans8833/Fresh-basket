import { badRequest, json, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { storeImage } from "@/lib/upload";

export const POST = route(async (req) => {
  await requireAdmin();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.");
  return json({ url: await storeImage(file) }, { status: 201 });
});
