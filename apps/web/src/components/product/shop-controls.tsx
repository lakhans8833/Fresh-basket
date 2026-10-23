"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "../ui/form";
import { Spinner } from "../ui/feedback";

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {pending ? <Spinner className="size-4 text-muted" /> : null}
      <label htmlFor="sort" className="sr-only">Sort products</label>
      <Select
        id="sort"
        value={value}
        className="h-9 w-auto min-w-36 rounded-lg text-sm"
        onChange={(e) => {
          const sp = new URLSearchParams(params.toString());
          if (e.target.value === "featured") sp.delete("sort");
          else sp.set("sort", e.target.value);
          start(() => router.push(`${pathname}?${sp}`, { scroll: false }));
        }}
      >
        <option value="featured">Recommended</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="name">Name: A–Z</option>
      </Select>
    </div>
  );
}
