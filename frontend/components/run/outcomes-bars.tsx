"use client";

import { motion } from "motion/react";

import { stagger } from "@/lib/motion";

import type { OutcomeSlice } from "./outcomes";
import { SLICE_TONE } from "./outcome-tones";
import { SliceTip } from "./outcomes-legend";

/**
 * The same shares, along rows. The pie says the proportions at a glance and
 * this says the numbers, so both are offered and neither is the only reading.
 *
 * Every bar is measured against the largest slice rather than against the
 * total, because at 300 of 428 the rest of them would be four invisible
 * stubs. The share each one is of the whole is printed beside it, which is
 * the annotation a scaled bar owes the reader and says what the length does
 * not, without a footnote under the panel explaining the arithmetic.
 */

interface OutcomesBarsProps {
  slices: OutcomeSlice[];
  lit: string | null;
  onLight: (key: string | null) => void;
}

export function OutcomesBars({ slices, lit, onLight }: OutcomesBarsProps) {
  const tallest = Math.max(...slices.map((slice) => slice.count), 1);
  let drawn = 0;
  return (
    <div className="min-w-0 grow">
      {(["finished", "parked"] as const).map((group) => {
        const rows = slices.filter((slice) => slice.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group}>
            <div className="flex h-[26px] items-center text-caption font-medium text-ink-tertiary">
              {group === "finished" ? "Finished with no person" : "Parked for a person"}
            </div>
            {rows.map((slice) => (
              <Row
                key={slice.key}
                slice={slice}
                index={drawn++}
                tallest={tallest}
                dimmed={lit !== null && lit !== slice.key}
                onLight={onLight}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  slice,
  index,
  tallest,
  dimmed,
  onLight,
}: {
  slice: OutcomeSlice;
  index: number;
  tallest: number;
  dimmed: boolean;
  onLight: (key: string | null) => void;
}) {
  const tone = SLICE_TONE[slice.tone];
  return (
    <SliceTip slice={slice}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={stagger(index)}
      onMouseEnter={() => onLight(slice.key)}
      onMouseLeave={() => onLight(null)}
      className={`flex h-[31px] items-center gap-2.5 transition-opacity duration-150 ${slice.group === "parked" ? "pl-3" : ""}`}
      style={{ opacity: dimmed ? 0.4 : 1 }}
    >
      <span className={`w-[132px] shrink-0 truncate text-small ${tone.key}`}>{slice.label}</span>
      <span className="relative block h-[5px] min-w-0 grow overflow-hidden rounded-full bg-sunken">
        <span
          className="absolute left-0 top-0 h-[5px] rounded-full transition-[width] duration-[1100ms] ease-out"
          style={{ width: `${(slice.count / tallest) * 100}%`, background: tone.bar }}
        />
      </span>
      <span className="w-[42px] shrink-0 text-right text-caption text-ink-tertiary tabular-nums">
        {slice.pct.toFixed(1)}%
      </span>
      <span className="w-[34px] shrink-0 text-right text-small font-medium tabular-nums">{slice.count}</span>
    </motion.div>
    </SliceTip>
  );
}
