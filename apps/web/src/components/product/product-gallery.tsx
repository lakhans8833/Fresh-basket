"use client";

import { useState } from "react";
import { ProductImage } from "./product-image";
import { cn } from "../ui/cn";

export function ProductGallery({ images, name }: { images: { id: string; url: string; alt: string | null }[]; name: string }) {
  const [i, setI] = useState(0);
  const current = images[i];
  return (
    <div className="flex flex-col gap-3">
      <ProductImage
        src={current?.url ?? null}
        alt={current?.alt ?? name}
        priority
        sizes="(min-width: 1024px) 45vw, 100vw"
        className="aspect-square w-full rounded-[1.75rem] bg-[#fbe3e1] md:aspect-[5/4]"
      />
      {images.length > 1 ? (
        <ul className="flex gap-2" aria-label="Product photos">
          {images.map((img, n) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setI(n)}
                aria-label={`Show photo ${n + 1}`}
                aria-current={n === i ? "true" : undefined}
                className={cn("block overflow-hidden rounded-xl border-2 transition", n === i ? "border-forest-800" : "border-transparent opacity-75 hover:opacity-100")}
              >
                <ProductImage src={img.url} alt="" sizes="80px" className="size-18 bg-sage-50" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
