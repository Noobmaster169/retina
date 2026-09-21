"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { cents, money, type PlanCost } from "./plan-cost";
import { framesFor, scrambleLike } from "./scramble";

/**
 * What the run cost.
 *
 * It used to lead with what the same tokens would have cost on the API, struck
 * through, and open onto the real figure beside the arithmetic that produced
 * it. Every part of that was for a reader who already knows what an API price
 * is, what a subscription is, and why one would be a fraction of the other.
 * Nobody else was being told anything: `21x cheaper` and `15% x 15% of $50 a
 * week` are the workings of an argument they had not been given.
 *
 * So it says the number. The run cost this much; here it is in both
 * currencies, and here is what that is per email, which is the only form of it
 * anyone repeats out loud. What it would have cost otherwise is in the title
 * for whoever wants it, and `plan-cost.ts` still carries and tests the
 * arithmetic.
 *
 * The digits roll when a reader points at them, because a figure this small is
 * worth a second look and a moment of movement is how you ask for one without
 * a word of explanation.
 */
export function CostReveal({ cost }: { cost: PlanCost }) {
  // Counts hovers rather than holding a boolean, so it can key the numbers: a
  // second look starts the roll from the beginning instead of joining one
  // already half settled.
  const [roll, setRoll] = useState(0);

  return (
    <div
      onMouseEnter={() => setRoll((at) => at + 1)}
      title={`${money(cost.apiUsd)} on the API. ${cost.working}.`}
      className="flex grow flex-col justify-center gap-1 rounded-lg border border-hairline bg-canvas px-3.5 py-3"
    >
      <span className="text-caption text-ink-tertiary">Cost</span>
      <span className="flex items-baseline gap-2.5">
        <Rolling key={`usd-${roll}`} value={money(cost.planUsd)} run={roll > 0} className="font-mono text-[22px] font-semibold tabular-nums text-match" />
        <Rolling
          key={`myr-${roll}`}
          value={`RM ${cost.planMyr.toFixed(2)}`}
          run={roll > 0}
          className="font-mono text-mono-sm tabular-nums text-ink-secondary"
        />
      </span>
      <span className="truncate text-caption text-ink-tertiary">{cents(cost.perEmailCents)} an email</span>
    </div>
  );
}

/** How long one frame of the roll lasts. Eight of them is a glance, not a wait. */
const FRAME_MS = 45;

/**
 * A value that rolls its digits and settles left to right.
 *
 * It renders the settled value on the server and on the first paint, so a
 * reader who never points at it, or who has asked for less motion, sees the
 * number and nothing else. The roll is a browser effect over the top.
 */
function Rolling({ value, run, className }: { value: string; run: boolean; className: string }) {
  // Set at mount and never from inside the effect: the element is keyed on the
  // hover that made it, so every roll begins with a fresh one of these.
  const [locked, setLocked] = useState<number | null>(run ? 0 : null);
  const still = useReducedMotion() ?? false;
  const frames = framesFor(value);

  useEffect(() => {
    if (!run || still) return;
    let at = 0;
    const tick = setInterval(() => {
      at += 1;
      if (at >= frames) {
        clearInterval(tick);
        setLocked(null);
        return;
      }
      setLocked(Math.floor((at / frames) * value.length));
    }, FRAME_MS);
    return () => clearInterval(tick);
  }, [run, still, frames, value.length]);

  // `still` wins at the render rather than by resetting state, so a reader who
  // asked for less motion never sees a rolled digit even for a frame.
  const shown = still || locked === null ? value : scrambleLike(value, locked, Math.random);
  return <span className={className}>{shown}</span>;
}
