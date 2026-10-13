"use client";

import { RotateCcw, CloudOff } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<CloudOff className="size-7" />}
        title="Something went wrong"
        action={<Button variant="dark" onClick={reset}><RotateCcw className="size-4" aria-hidden /> Try again</Button>}
      >
        We couldn&apos;t load this page. Please check your connection and try again.
      </EmptyState>
    </div>
  );
}
