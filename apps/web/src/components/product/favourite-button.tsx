"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../ui/cn";

const KEY = "fb_favourites_v1";
const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** Saved-for-later hearts. Stored on this device only. */
export function FavouriteButton({ productId, name, className }: { productId: string; name: string; className?: string }) {
  const [on, setOn] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read device-local favourites after mount
  useEffect(() => setOn(read().includes(productId)), [productId]);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Save ${name} to favourites`}
      onClick={(e) => {
        e.preventDefault();
        const list = read();
        const next = on ? list.filter((x) => x !== productId) : [...list, productId];
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        setOn(!on);
      }}
      className={cn("grid size-9 place-items-center rounded-full bg-white/85 text-forest-800 shadow-sm backdrop-blur transition hover:bg-white", className)}
    >
      <Heart className={cn("size-[1.05rem]", on && "fill-tomato text-tomato")} />
    </button>
  );
}
