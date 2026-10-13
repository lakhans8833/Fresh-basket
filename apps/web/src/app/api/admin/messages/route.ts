import { json, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminListMessages, adminSubscriberCount } from "@/lib/admin/config";

export const GET = route(async () => {
  await requireStaff();
  return json({ messages: await adminListMessages(), subscribers: await adminSubscriberCount() });
});
