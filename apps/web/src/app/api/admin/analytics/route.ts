import { json, route } from "@/lib/http";
import { requireStaff } from "@/lib/auth";
import { adminAnalytics, ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/admin/analytics";

export const GET = route(async (req: Request) => {
  await requireStaff();
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days: AnalyticsRange = (ANALYTICS_RANGES as readonly number[]).includes(asked) ? (asked as AnalyticsRange) : 30;
  return json(await adminAnalytics(days));
});
