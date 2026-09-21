"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SORT_OPTIONS, type SortKey } from "./sort";

/** The list's order, in the URL like its view and filters. */
export function SortSelect({ current }: { current: SortKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-1.5 text-caption text-ink-tertiary">
      Sort
      <select
        value={current}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set("sort", event.target.value);
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
        className="h-8 rounded-md border border-hairline bg-canvas px-2 text-strong text-ink"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
