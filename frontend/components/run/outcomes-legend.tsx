"use client";

import { Tooltip } from "@/components/ui/tooltip";

import type { OutcomeSlice } from "./outcomes";
import { SLICE_TONE } from "./outcome-tones";

/**
 * What the pie's colours mean, and what each outcome is. The row says it in
 * plain English and the tooltip carries the organisers' own enum beside the
 * sentence, so the word the scorer speaks is one hover away and never on the
 * face of a panel a business owner reads first.
 */

/** The sentence behind one outcome. Shared with the bar view, which owes its rows the same. */
export function SliceTip({ slice, children }: { slice: OutcomeSlice; children: React.ReactNode }) {
  return (
    <Tooltip
      label={
        <>
          <span className="block font-mono text-mono-sm text-ink">{slice.key}</span>
          <span className="mt-1 block">{slice.says}</span>
          <span className="mt-1.5 block text-ink-tertiary">
            {slice.count} {slice.count === 1 ? "email" : "emails"}, {slice.pct.toFixed(1)}% of the run.
          </span>
        </>
      }
    >
      {children}
    </Tooltip>
  );
}

interface LegendProps {
  slices: OutcomeSlice[];
  lit: string | null;
  onLight: (key: string | null) => void;
}

/**
 * Under the circle rather than beside it. Beside it, the panel had to be wide
 * enough for a 184px ring and seven labelled rows at once, and it is not: with
 * the chat dock open the labels were squeezed out entirely and the legend was
 * a column of bare percentages. Below, it wraps into as many columns as the
 * width allows and reads at any of them.
 */
export function OutcomesLegend({ slices, lit, onLight }: LegendProps) {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 @[560px]:w-auto @[560px]:max-w-[320px] @[560px]:grid-cols-1">
      {slices.map((slice) => (
        <SliceTip key={slice.key} slice={slice}>
          <div
            tabIndex={0}
            onMouseEnter={() => onLight(slice.key)}
            onMouseLeave={() => onLight(null)}
            onFocus={() => onLight(slice.key)}
            onBlur={() => onLight(null)}
            className="flex h-[27px] min-w-0 cursor-default items-center gap-2 rounded-sm transition-opacity duration-150"
            style={{ opacity: lit !== null && lit !== slice.key ? 0.4 : 1 }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: SLICE_TONE[slice.tone].bar }}
              aria-hidden="true"
            />
            <span className={`min-w-0 truncate text-small ${SLICE_TONE[slice.tone].key}`}>{slice.label}</span>
            <span className="grow" />
            <span className="shrink-0 text-caption text-ink-tertiary tabular-nums">{slice.pct.toFixed(1)}%</span>
            <span className="w-[34px] shrink-0 text-right text-small font-medium tabular-nums">{slice.count}</span>
          </div>
        </SliceTip>
      ))}
    </div>
  );
}
