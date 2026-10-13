import type { Metadata } from "next";
import { listAddresses } from "@/lib/account";
import { requireAccountSession } from "../require-session";
import { AddressBook } from "@/components/account/address-book";

export const metadata: Metadata = { title: "Your addresses" };

export default async function AddressesPage() {
  const { userId } = await requireAccountSession("/account/addresses");
  const addresses = await listAddresses(userId);
  return <AddressBook initial={addresses} />;
}
