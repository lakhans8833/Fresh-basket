import { Sprout } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState icon={<Sprout className="size-7" />} title="We couldn't find that page" action={<ButtonLink href="/shop">Browse vegetables</ButtonLink>}>
        It may have moved, or the product is no longer available.
      </EmptyState>
    </div>
  );
}
