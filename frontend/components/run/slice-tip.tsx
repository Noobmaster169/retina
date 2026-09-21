"use client";

import { Tooltip } from "@/components/ui/tooltip";

import type { OutcomeSlice } from "./outcomes";

/**
 * The sentence behind one outcome, and the organisers' own enum beside it.
 *
 * Split out when the ring and its legend went: the enum is the word the
 * scorer speaks, and it belongs one hover away rather than on the face of the
 * panel a business owner reads first. Both the bars and the flow owe a reader
 * the same sentence, so neither owns it.
 */
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
