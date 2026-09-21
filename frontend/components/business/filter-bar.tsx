"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Search and up to two selects, all in the URL. Text is debounced so typing
 * does not push a history entry per keystroke; a select applies at once.
 */
export interface SelectFilter {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

interface FilterBarProps {
  searchParam?: string;
  placeholder: string;
  selects?: SelectFilter[];
  shown: number;
  total: number;
}

export function FilterBar({ searchParam = "q", placeholder, selects = [], shown, total }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(params.get(searchParam) ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((params.get(searchParam) ?? "") === text) return;
      const next = new URLSearchParams(params.toString());
      if (text) next.set(searchParam, text);
      else next.delete(searchParam);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [text, params, pathname, router, searchParam]);

  function select(param: string, value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex grow flex-wrap items-center gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-[240px] rounded-md border border-hairline bg-sunken px-2.5 text-strong text-ink placeholder:text-ink-faint"
      />
      {selects.map((item) => (
        <label key={item.param} className="flex items-center gap-1.5 text-caption text-ink-tertiary">
          {item.label}
          <select
            value={params.get(item.param) ?? ""}
            onChange={(event) => select(item.param, event.target.value)}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-strong text-ink"
          >
            <option value="">All</option>
            {item.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <span className="grow" />
      <span className="font-mono text-mono-sm text-ink-tertiary">{shown === total ? total : `${shown} of ${total}`}</span>
    </div>
  );
}
