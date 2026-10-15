import Link from "next/link";
import { Compass, Home, LogIn } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { buttonClass } from "@/components/ui/button";
import { AdminAuthFrame } from "@/components/admin/admin-auth-frame";

export default async function AdminNotFound() {
  const settings = await getSettings();
  return (
    <AdminAuthFrame storeName={settings.storeName}>
      <span className="grid size-12 place-items-center rounded-full bg-lime-100 text-forest-800">
        <Compass className="size-6" aria-hidden />
      </span>
      <p className="eyebrow mt-4">Error 404</p>
      <h1 className="mt-1 text-[1.6rem] font-semibold leading-tight text-forest-900">This admin page doesn&apos;t exist</h1>
      <p className="mt-2 text-sm text-muted">The link may be mistyped, or the page was moved.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link href="/admin/login" className={buttonClass("dark")}>
          <LogIn className="size-4" aria-hidden /> Admin login
        </Link>
        <Link href="/" className={buttonClass("outline")}>
          <Home className="size-4" aria-hidden /> Home
        </Link>
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Already signed in? <Link href="/admin" className="font-medium text-leaf-600 hover:underline">Go to the dashboard</Link>
      </p>
    </AdminAuthFrame>
  );
}
