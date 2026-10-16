"use client";

import Image from "next/image";
import { useState } from "react";
import { LeafMark } from "../layout/logo";
import { cn } from "../ui/cn";

/**
 * Product photo with a clean, neutral placeholder when no photo has been uploaded yet — or when the
 * saved photo can't be loaded (deleted file, broken link). Never substitutes another product's photo.
 */
export function ProductImage({ src, alt, className, sizes, priority }: { src: string | null; alt: string; className?: string; sizes: string; priority?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <div className={cn("@container relative grid place-items-center bg-gradient-to-br from-sage-100 to-lime-50", className)} role="img" aria-label={`${alt} — photo coming soon`}>
        <div className="flex flex-col items-center gap-1.5 text-forest-700/45">
          <LeafMark className="size-6 @[8rem]:size-10" />
          <span className="hidden text-[0.6875rem] font-medium uppercase tracking-[0.14em] @[8rem]:block">Photo soon</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" onError={() => setFailed(src)} />
    </div>
  );
}
