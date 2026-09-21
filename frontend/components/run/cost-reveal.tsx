"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { cents, money, type PlanCost } from "./plan-cost";

/**
 * What the run cost, which is the one number on this panel worth arguing with.
 *
 * The API price comes first because it is the number a reader expects and the
 * one every comparison is made against. It is struck through, and the stroke
 * draws itself again every few seconds, because a price crossed out is a
 * question and this one has an answer worth opening: the work ran on a flat
 * subscription, so what it really took is a share of a month rather than a
 * charge.
 *
 * Four lines at most, and none of them wraps. The first draft explained itself
 * in sentences, and a tile this narrow turned each one into two lines of
 * caption under a number that is two words long. `On the API` and `On our
 * plan` do the same work in three words, because the two sit one above the
 * other and the comparison needs no announcing.
 *
 * A reader who does not want motion gets the line already drawn, and a reader
 * who never opens it still sees an honest headline.
 */
export function CostReveal({ cost }: { cost: PlanCost }) {
  const [open, setOpen] = useState(false);
  const still = useReducedMotion() ?? false;

  return (
    <button
      type="button"
      onClick={() => setOpen((was) => !was)}
      aria-expanded={open}
      title={open ? `${money(cost.apiUsd)} on the API. ${cost.working}.` : undefined}
      className="flex grow flex-col justify-center gap-1 rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-left transition-colors duration-150 hover:border-hairline-strong hover:bg-surface"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-caption text-ink-tertiary">{open ? "On our plan" : "On the API"}</span>
        <span className="grow" />
        {/* The counterfactual keeps its place, small, once the real one has the floor. */}
        {open ? <Struck amount={money(cost.apiUsd)} still animate={false} /> : null}
      </span>

      {open ? (
        <>
          <span className="flex items-baseline gap-2.5">
            <motion.span
              initial={{ opacity: 0, y: still ? 0 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-[22px] font-semibold tabular-nums text-match"
            >
              {money(cost.planUsd)}
            </motion.span>
            <span className="font-mono text-mono-sm tabular-nums text-ink-secondary">RM {cost.planMyr.toFixed(2)}</span>
          </span>
          <span className="truncate text-caption text-ink-secondary">
            {cents(cost.perEmailCents)} an email
            {cost.timesCheaper ? ` · ${cost.timesCheaper.toFixed(0)}x cheaper` : ""}
          </span>
          <span className="truncate text-caption text-ink-tertiary">{cost.working}</span>
        </>
      ) : (
        <>
          <Struck amount={money(cost.apiUsd)} still={still} animate />
          <span className="truncate text-caption text-ink-tertiary">Nothing was billed. Tap.</span>
        </>
      )}
    </button>
  );
}

/**
 * A price with a line through it. The line is its own element rather than a
 * text decoration so it can be drawn: a decoration appears all at once, and
 * the point of this one is that it is being crossed out in front of you.
 *
 * It draws, holds, then fades. It used to retract the way it came, which is
 * the same movement backwards and read as a mistake being undone rather than
 * as a loop starting again.
 */
function Struck({ amount, still, animate }: { amount: string; still: boolean; animate: boolean }) {
  const big = animate;
  const drawn = still || !animate;
  return (
    <span className="relative inline-block">
      <span className={`font-mono tabular-nums text-ink-tertiary ${big ? "text-[22px] font-semibold" : "text-mono-sm"}`}>
        {amount}
      </span>
      <motion.span
        aria-hidden="true"
        initial={drawn ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 1 }}
        animate={drawn ? { scaleX: 1, opacity: 1 } : { scaleX: [0, 1, 1, 1], opacity: [1, 1, 1, 0] }}
        transition={
          drawn
            ? undefined
            : { duration: 2.1, times: [0, 0.34, 0.82, 1], repeat: Infinity, repeatDelay: 0.7, ease: [0.2, 0, 0, 1] }
        }
        style={{ originX: 0 }}
        className={`absolute left-0 right-0 ${big ? "top-[13px] h-[2px]" : "top-[8px] h-px"} rounded-full bg-fault`}
      />
    </span>
  );
}
