"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { onFavouritesChange, readFavourites, writeFavourites } from "./favourites";

/** Saved-for-later hearts. Stored on this device only; listed on /wishlist. */
export function FavouriteButton({ productId, name, className }: { productId: string; name: string; className?: string }) {
  const [on, setOn] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const sync = () => setOn(readFavourites().includes(productId));
    sync();
    return onFavouritesChange(sync);
  }, [productId]);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from saved items` : `Save ${name} for later`}
      onClick={(e) => {
        e.preventDefault();
        const list = readFavourites();
        writeFavourites(on ? list.filter((x) => x !== productId) : [...list.filter((x) => x !== productId), productId]);
        toast(on ? `${name} removed from saved items` : `${name} saved — see it in Saved items`);
      }}
      className={cn("grid size-9 place-items-center rounded-full bg-white/85 text-forest-800 shadow-sm backdrop-blur transition hover:bg-white", className)}
    >
      <Heart className={cn("size-[1.05rem]", on && "fill-tomato text-tomato")} />
    </button>
  );
}
