import { json, route } from "@/lib/http";
import { listCategories } from "@/lib/catalog";

export const GET = route(async () => json({ categories: await listCategories() }));
