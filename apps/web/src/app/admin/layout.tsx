import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/** /admin/login and the admin 404 live here; the signed-in panel is in (panel)/layout.tsx. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
