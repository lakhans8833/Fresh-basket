import { redirect } from "next/navigation";

/** Old short link — "Buy again" lives in the account section. */
export default function BuyAgainRedirect() {
  redirect("/account/buy-again");
}
