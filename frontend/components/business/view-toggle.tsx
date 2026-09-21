"use client";

import { Icon, type IconName } from "@/components/ui/icons";

/** Cards, Table, and Map where the list offers it. One control, segmented, the current one filled. */
export interface ViewOption<V extends string> {
  key: V;
  label: string;
  icon: IconName;
}

export function ViewToggle<V extends string>({
  views,
  current,
  onChange,
}: {
  views: ViewOption<V>[];
  current: V;
  onChange(next: V): void;
}) {
  return (
    <div role="group" aria-label="View" className="inline-flex h-8 items-center rounded-md border border-hairline-strong p-0.5">
      {views.map((view) => {
        const here = view.key === current;
        return (
          <button
            key={view.key}
            type="button"
            onClick={() => onChange(view.key)}
            aria-pressed={here}
            className={`flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-small font-medium transition-colors duration-150 ${
              here ? "bg-accent-tint text-accent" : "text-ink-secondary hover:bg-active"
            }`}
          >
            <Icon name={view.icon} size={13} />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
