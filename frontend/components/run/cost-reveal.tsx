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
 * charge, and the share is small enough that nobody believes it unarguing.
 *
 * So it opens rather than asserting. Closed it says what you would have paid;
 * open it says what it actually came to, in both currencies, per email, and
 * with the arithmetic beside it so the claim can be checked instead of
 * trusted. `plan-cost.ts` is where that arithmetic lives and is tested.
 *
 * A reader who does not want motion gets the same tile with the line already
 * drawn, and a reader who never clicks still sees an honest headline.
 */
export function CostReveal({ cost }: { cost: PlanCost }) {
  const [open, setOpen] = useState(false);
  const still = useReducedMotion();

  return (
    <button
      type="button"
      onClick={() => setOpen((was) => !was)}
      aria-expanded={open}
      className="flex grow flex-col justify-center gap-1 rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-left transition-colors duration-150 hover:border-hairline-strong hover:bg-surface"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-caption text-ink-tertiary">{open ? "On the subscription it ran on" : "What it took"}</span>
        <span className="grow" />
        {/* The counterfactual keeps its place once the real one has the floor. */}
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
          <span className="text-caption text-ink-secondary">
            {cents(cost.perEmailCents)} an email
            {cost.timesCheaper ? ` · ${cost.timesCheaper.toFixed(0)}x cheaper` : ""}
          </span>
          <span className="text-caption leading-[15px] text-ink-tertiary">{cost.working.join(" · ")}</span>
        </>
      ) : (
        <>
          <Struck amount={money(cost.apiUsd)} still={still ?? false} animate />
          <span className="text-caption text-ink-tertiary">Nothing was billed. Tap to see what it really took.</span>
        </>
      )}
    </button>
  );
}

/**
 * A price with a line through it. The line is its own element rather than a
 * text decoration so it can be drawn: a decoration appears all at once, and
 * the point of this one is that it is being crossed out in front of you.
 */
function Struck({ amount, still, animate }: { amount: string; still: boolean; animate: boolean }) {
  const big = animate;
  return (
    <span className="relative inline-block">
      <span
        className={`font-mono tabular-nums text-ink-tertiary ${big ? "text-[22px] font-semibold" : "text-mono-sm"}`}
      >
        {amount}
      </span>
      <motion.span
        aria-hidden="true"
        initial={still || !animate ? { scaleX: 1 } : { scaleX: 0 }}
        animate={still || !animate ? { scaleX: 1 } : { scaleX: [0, 1, 1, 0] }}
        transition={
          still || !animate
            ? undefined
            : { duration: 3.4, times: [0, 0.22, 0.82, 1], repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }
        }
        style={{ originX: 0 }}
        className={`absolute left-0 right-0 ${big ? "top-[13px] h-[2px]" : "top-[8px] h-px"} rounded-full bg-fault`}
      />
    </span>
  );
}
