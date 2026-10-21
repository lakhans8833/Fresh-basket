import ShopLayout from "./(shop)/layout";
import ShopNotFound from "./(shop)/not-found";

/** Any unknown address (e.g. a mistyped /vegetables) gets the shop's 404 with the normal header and footer. */
export default function NotFound() {
  return (
    <ShopLayout>
      <ShopNotFound />
    </ShopLayout>
  );
}
