"use client";

import { useEffect, useRef } from "react";
import { ArrowUpDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { Icon } from "@/components/ui/icons";
import type { Tone } from "@/components/ui/chip";

import { type Emphasis, emphasisOf, FILTERS, type FilterKey, type InboxView, SORTS, SortKey } from "./inbox-filters";

/**
 * How the list is narrowed: a search, a row of chips, and one ordering.
 *
 * Chips and not tabs. A tab says "this is a different screen", which is what
 * made clicking a message from `All` land somewhere else entirely; a chip says
 * "fewer of the same rows", which is the truth. Every count is counted over
 * what the search left, so a chip never promises rows the search has taken.
 */

/**
 * A filter chip is a control, so it carries a hairline whether or not it is
 * chosen. The status chips in a row carry a tint and no border because they
 * are labels and nothing happens when you press them; these look pressable
 * because they are, and the border is the whole difference.
 *
 * Three ways one is drawn, by `emphasisOf`: chosen, asking for a person,
 * holding rows, or empty. Tailwind cannot build a class name out of a tone, so
 * each is a table of literals.
 */
const CHOSEN: Record<Tone, string> = {
  neutral: "border-hairline-strong bg-active text-ink",
  match: "border-match-line bg-match-tint text-match",
  differ: "border-differ-line bg-differ-tint text-differ",
  review: "border-review-line bg-review-tint text-review",
  fault: "border-fault-line bg-fault-tint text-fault",
  signal: "border-signal-line bg-signal-tint text-signal",
  accent: "border-accent-line bg-accent-tint text-accent",
};

/** Its hue in the border and the words, never a fill: a fill is what chosen means. */
const ASKING: Record<Tone, string> = {
  neutral: "border-hairline text-ink-secondary hover:bg-sunken",
  match: "border-match-line text-match hover:bg-match-tint",
  differ: "border-differ-line text-differ hover:bg-differ-tint",
  review: "border-review-line text-review hover:bg-review-tint",
  fault: "border-fault-line text-fault hover:bg-fault-tint",
  signal: "border-signal-line text-signal hover:bg-signal-tint",
  accent: "border-accent-line text-accent hover:bg-accent-tint",
};

/** Its hue in the words only. */
const HOLDING: Record<Tone, string> = {
  neutral: "border-hairline text-ink-secondary hover:border-hairline-strong hover:bg-sunken",
  match: "border-hairline text-match hover:border-match-line hover:bg-match-tint",
  differ: "border-hairline text-differ hover:border-differ-line hover:bg-differ-tint",
  review: "border-hairline text-review hover:border-review-line hover:bg-review-tint",
  fault: "border-hairline text-fault hover:border-fault-line hover:bg-fault-tint",
  signal: "border-hairline text-signal hover:border-signal-line hover:bg-signal-tint",
  accent: "border-hairline text-accent hover:border-accent-line hover:bg-accent-tint",
};

const EMPTY = "border-hairline text-ink-tertiary hover:border-hairline-strong hover:bg-sunken";

function chipClass(tone: Tone, emphasis: Emphasis): string {
  if (emphasis === "chosen") return `font-medium ${CHOSEN[tone]}`;
  if (emphasis === "asking") return `font-medium ${ASKING[tone]}`;
  if (emphasis === "holding") return HOLDING[tone];
  return EMPTY;
}

interface FilterBarProps {
  view: InboxView;
  onView: (next: Partial<InboxView>) => void;
  counts: Record<FilterKey, number>;
}

export function FilterBar({ view, onView, counts }: FilterBarProps) {
  const field = useRef<HTMLInputElement>(null);

  // A list this long is searched far more often than it is scrolled, so the
  // search takes a key of its own rather than a trip to the top of the column.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || typingAlready(event.target)) return;
      event.preventDefault();
      field.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A chip is drawn when it is one of the steady five, when it has rows, or
  // when it is the one in use: the bar never moves out from under a click.
  const chips = FILTERS.filter((filter) => filter.steady || counts[filter.key] > 0 || filter.key === view.filter);

  return (
    <div className="shrink-0 border-b border-hairline px-[18px] pb-2.5 pt-3">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((filter) => {
          const here = filter.key === view.filter;
          const emphasis = emphasisOf(filter.tone, counts[filter.key], here);
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onView({ filter: filter.key })}
              aria-pressed={here}
              className={`inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-sm border px-2 text-caption transition-colors duration-150 ${chipClass(
                filter.tone,
                emphasis,
              )}`}
            >
              {filter.label}
              <span className={`font-mono text-mono-xs tabular-nums ${emphasis === "empty" ? "text-ink-faint" : ""}`}>
                {counts[filter.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <div className="relative min-w-0 grow">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref={field}
            type="text"
            value={view.query}
            onChange={(event) => onView({ query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              onView({ query: "" });
            }}
            placeholder="Sender or subject"
            aria-label="Search this run's emails"
            className="h-8 w-full rounded-md border border-hairline bg-sunken pl-[30px] pr-7 text-strong text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-accent-line focus:bg-canvas focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              onView({ query: "" });
              field.current?.focus();
            }}
            aria-label="Clear the search"
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-ink-faint transition-colors duration-150 hover:bg-active hover:text-ink-secondary"
          >
            <Icon name="close" size={10} />
          </button>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={`Sort emails. Current order: ${SORTS.find((sort) => sort.key === view.sort)?.label ?? "Email id"}`}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
              view.sort === "id"
                ? "border-hairline text-ink-secondary hover:border-hairline-strong hover:bg-sunken"
                : "border-accent-line bg-accent-tint text-accent"
            }`}
          >
            <ArrowUpDown size={14} strokeWidth={1.6} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[180px] overflow-hidden rounded-lg border border-hairline bg-canvas py-1 shadow-overlay"
            >
              <div className="px-3 py-1.5 text-caption text-ink-tertiary">Sort emails</div>
              <DropdownMenu.RadioGroup
                value={view.sort}
                onValueChange={(value) => {
                  const next = SortKey.safeParse(value);
                  if (next.success) onView({ sort: next.data });
                }}
              >
                {SORTS.map((sort) => (
                  <DropdownMenu.RadioItem
                    key={sort.key}
                    value={sort.key}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-small text-ink-secondary outline-none transition-colors duration-150 data-[highlighted]:bg-sunken data-[state=checked]:text-ink"
                  >
                    <span className="grow">{sort.label}</span>
                    {view.sort === sort.key ? <Icon name="check" size={12} className="text-accent" /> : null}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

/** A key pressed into a field belongs to that field. */
function typingAlready(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
