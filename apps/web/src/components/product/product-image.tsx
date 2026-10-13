import Image from "next/image";
import { LeafMark } from "../layout/logo";
import { cn } from "../ui/cn";

/** Product photo with a graceful placeholder when no photo has been uploaded yet. */
export function ProductImage({ src, alt, className, sizes, priority }: { src: string | null; alt: string; className?: string; sizes: string; priority?: boolean }) {
  if (!src) {
    return (
      <div className={cn("relative grid place-items-center bg-gradient-to-br from-sage-100 to-lime-50", className)} role="img" aria-label={`${alt} — photo coming soon`}>
        <div className="flex flex-col items-center gap-1.5 text-forest-700/45">
          <LeafMark className="size-10" />
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.14em]">Photo soon</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}
