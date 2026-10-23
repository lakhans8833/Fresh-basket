import type { Metadata } from "next";
import ShopLayout from "./(shop)/layout";
import ShopNotFound from "./(shop)/not-found";

// A real 404 title (it showed the home page title) and kept out of search results.
export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Any unknown address (e.g. a mistyped /vegetables) gets the shop's 404 with the normal header and footer. */
export default function NotFound() {
  return (
    <ShopLayout>
      <ShopNotFound />
    </ShopLayout>
  );
}
