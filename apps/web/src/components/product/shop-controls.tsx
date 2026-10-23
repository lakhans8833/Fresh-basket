"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
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
      <select
        id="sort"
        value={value}
        // Own classes (not the form Select): a 36 px chip that matches the filter chips beside it.
        className="h-9 shrink-0 cursor-pointer appearance-none rounded-lg border border-line bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%2366715f%22 stroke-width=%221.6%22 fill=%22none%22/></svg>')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pl-3 pr-8 text-sm font-medium text-ink-soft hover:border-forest-700/30 focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-lime-200/70"
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
      </select>
    </div>
  );
}
