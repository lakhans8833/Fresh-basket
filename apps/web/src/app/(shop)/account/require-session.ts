import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** Account pages need a signed-in customer; send everyone else to sign in and back here afterwards. */
export async function requireAccountSession(path: string) {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`);
  return session;
}
