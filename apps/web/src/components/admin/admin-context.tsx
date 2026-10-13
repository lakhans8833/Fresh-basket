"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { EmptyState } from "../ui/feedback";
import { ButtonLink } from "../ui/button";

export type AdminRole = "admin" | "staff";
export interface AdminInfo {
  role: AdminRole;
  storeName: string;
  devMode: boolean;
}

const Ctx = createContext<AdminInfo>({ role: "staff", storeName: "Fresh Basket", devMode: false });

export function AdminProvider({ value, children }: { value: AdminInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAdmin = () => useContext(Ctx);

/** Pages only admins may use. Staff see a friendly explanation (the API refuses anyway). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { role } = useAdmin();
  if (role === "admin") return <>{children}</>;
  return (
    <EmptyState icon={<Lock className="size-7" aria-hidden />} title="Admins only" action={<ButtonLink href="/admin" variant="outline">Back to dashboard</ButtonLink>}>
      Staff accounts can manage orders, inventory and messages. Ask a store admin if you need access to this section.
    </EmptyState>
  );
}
