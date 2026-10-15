import { notFound } from "next/navigation";

/** Any unknown /admin/... address shows the admin 404 (app/admin/not-found.tsx). */
export default function AdminMissing() {
  notFound();
}
