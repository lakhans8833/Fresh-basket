import { adminBannerSchema } from "@freshbasket/shared";
import { z } from "zod";
import { badRequest, json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminDeleteBanner, adminSaveBanner } from "@/lib/banners";

const id = async (params: Promise<{ id: string }>) => {
  const v = (await params).id;
  if (!z.string().uuid().safeParse(v).success) throw badRequest("Invalid banner id.");
  return v;
};

export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  return json(await adminSaveBanner(await id(params), await parseBody(req, adminBannerSchema)));
});
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await adminDeleteBanner(await id(params));
  return json({ ok: true });
});
