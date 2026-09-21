"use client";

import { useState } from "react";

import { FASTEST_TIER, labelOf, positionOf, SLOWEST_TIER, tierAt } from "./tiers";

/**
 * How quickly a sender is served, as a thing you drag rather than a list you
 * open.
 *
 * It replaced a five-option menu. The menu was accurate and said nothing: five
 * words in a box give no sense that they are one scale, or that moving a
 * sender up moves every other sender down behind it. A track shows the scale,
 * and where this sender sits on it, without being read.
 *
 * Right is sooner. The tier stored behind it runs the other way, which
 * `tiers.ts` explains and nobody on screen ever sees.
 *
 * It commits when the handle is let go, not on every step it passes through.
 * Dragging from `Last` to `First` crosses three positions, and writing each of
 * them would send four requests and four toasts to record one decision.
 */
export function ServeSlider({
  tier,
  domain,
  disabled,
  onCommit,
}: {
  tier: number;
  /** Named in the label, because a page of these needs to say which sender each one is. */
  domain: string;
  disabled: boolean;
  onCommit: (tier: number) => void;
}) {
  // The handle follows the finger; the decision is what it was let go on. A
  // value arriving from a save is picked up again through the key on the
  // element, so a refused write snaps back rather than lying.
  const [dragging, setDragging] = useState<number | null>(null);
  const position = dragging ?? positionOf(tier);
  const word = labelOf(tierAt(position));

  const commit = () => {
    if (dragging === null) return;
    const next = tierAt(dragging);
    setDragging(null);
    if (next !== tier) onCommit(next);
  };

  return (
    <span className="flex items-center gap-2.5">
      <input
        type="range"
        min={FASTEST_TIER}
        max={SLOWEST_TIER}
        step={1}
        value={position}
        disabled={disabled}
        aria-label={`How soon ${domain} is served`}
        // Numbers are the wrong thing to read out here: the scale is words,
        // and 4 of 5 means nothing without knowing which end is which.
        aria-valuetext={word}
        onChange={(event) => setDragging(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="h-1 w-[104px] cursor-pointer appearance-none rounded-full bg-sunken accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className={`w-[52px] shrink-0 text-strong ${dragging === null ? "text-ink-secondary" : "text-ink"}`}>{word}</span>
    </span>
  );
}
