"use client";

import { useId } from "react";

import type { OutcomeSlice } from "./outcomes";
import { SLICE_TONE } from "./outcome-tones";

/**
 * Where the run's emails ended up, as one circle. Every slice is a share of
 * the same whole, which the list this replaced could not claim: see
 * outcomes.ts.
 *
 * Arcs of one stroked circle rather than filled wedges. A dash is one number
 * per slice, it lands on the hairline geometry the rest of the product is
 * drawn in, and the hole it leaves is where the total goes, which is the
 * number a person came to the panel for.
 */

const SIZE = 184;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** A hairline of canvas between two arcs, so neighbours read as two slices and not one. */
const GAP_DEG = 1.2;

interface OutcomesPieProps {
  slices: OutcomeSlice[];
  total: number;
  /** The slice the cursor is on, anywhere in the panel. Null when it is on none of them. */
  lit: string | null;
  onLight: (key: string | null) => void;
}

export function OutcomesPie({ slices, total, lit, onLight }: OutcomesPieProps) {
  const drawn = turns(slices.filter((slice) => slice.count > 0));
  const titleId = useId();
  const shown = lit === null ? null : (slices.find((slice) => slice.key === lit) ?? null);

  return (
    // The geometry below stays in viewBox units; only the drawn size follows
    // the panel, so the ring fills a wide board without a second set of numbers.
    <div className="relative h-[184px] w-[184px] shrink-0 @[560px]:h-[232px] @[560px]:w-[232px]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          {total === 0
            ? "No email has landed yet."
            : drawn.map(({ slice }) => `${slice.key}: ${slice.count}, ${slice.pct.toFixed(1)} percent`).join(". ")}
        </title>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--surface-sunken)" strokeWidth={STROKE} />
        {drawn.map(({ slice, fromDeg }) => (
          <Arc key={slice.key} slice={slice} fromDeg={fromDeg} dimmed={lit !== null && lit !== slice.key} onLight={onLight} />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[27px] leading-none tracking-[-0.015em] tabular-nums @[560px]:text-[34px]">
          {shown ? shown.count : total}
        </span>
        <span className="mt-1 max-w-[132px] truncate text-center text-caption text-ink-tertiary">
          {shown ? `${shown.pct.toFixed(1)}% of ${total}` : total === 1 ? "email" : "emails"}
        </span>
      </div>
    </div>
  );
}

/** Where each arc starts, in degrees around the circle: every share before it, added up. */
function turns(slices: OutcomeSlice[]): { slice: OutcomeSlice; fromDeg: number }[] {
  let turned = 0;
  return slices.map((slice) => {
    const fromDeg = turned;
    turned += (slice.pct / 100) * 360;
    return { slice, fromDeg };
  });
}

function Arc({
  slice,
  fromDeg,
  dimmed,
  onLight,
}: {
  slice: OutcomeSlice;
  fromDeg: number;
  dimmed: boolean;
  onLight: (key: string | null) => void;
}) {
  const wholeDeg = (slice.pct / 100) * 360;
  // A slice narrower than the gap would be drawn backwards, so it gives up a share of itself instead.
  const length = ((wholeDeg - Math.min(GAP_DEG, wholeDeg * 0.4)) / 360) * CIRCUMFERENCE;
  return (
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      fill="none"
      stroke={SLICE_TONE[slice.tone].bar}
      strokeWidth={STROKE}
      strokeDasharray={`${length} ${CIRCUMFERENCE}`}
      strokeDashoffset={-((fromDeg / 360) * CIRCUMFERENCE)}
      className="cursor-default transition-opacity duration-150"
      style={{ opacity: dimmed ? 0.24 : 1 }}
      onMouseEnter={() => onLight(slice.key)}
      onMouseLeave={() => onLight(null)}
    />
  );
}
