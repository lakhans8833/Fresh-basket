import { json, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListUsers } from "@/lib/admin/users";

export const GET = route(async (req) => {
  await requireAdmin();
  return json({ users: await adminListUsers(new URL(req.url).searchParams.get("q")) });
});
