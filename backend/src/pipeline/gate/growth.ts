import type { GateStanding } from "../../contracts";

import { NEW_DAILY } from "./standing";

/**
 * A sender may grow, but not in one step.
 *
 * Standing alone still lets an established sender go from forty units a day to
 * six thousand overnight, which is what a compromised account looks like from
 * the outside. So the day's cap is additionally clamped to three times what
 * this sender's own fortnight says is normal.
 *
 * The result is a ladder rather than a ceiling: roughly triple a normal day
 * without anyone noticing, and once that is the new normal, triple again
 * tomorrow. Gradual growth passes. A spike does not.
 *
 * Pure: fourteen integers in, one integer out. The median is over all fourteen
 * days including the zero ones, which is what keeps a quiet week from
 * collapsing the cap and one loud day from raising it.
 */

const GROWTH_FACTOR = 3;
export const BASELINE_DAYS = 14;

/**
 * Only the earned brackets. `new` has no fortnight worth having, and `trusted`
 * is a decision a person made that arithmetic does not get to second guess.
 */
const CLAMPED: GateStanding[] = ["regular", "established"];

/** The middle of the sorted values, averaging the two middles of an even-length window. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface ClampInput {
  standing: GateStanding;
  /** What the bracket allows before this narrows it. */
  standingDaily: number;
  /**
   * Units on each of the last BASELINE_DAYS days, today excluded. Shorter is
   * padded with zeros, because a sender with four days of history has ten days
   * of not having sent anything and that is the honest baseline.
   */
  recentDailyUnits: number[];
}

export function clampDaily({ standing, standingDaily, recentDailyUnits }: ClampInput): number {
  if (!CLAMPED.includes(standing)) return standingDaily;

  const window = [...recentDailyUnits.slice(-BASELINE_DAYS)];
  while (window.length < BASELINE_DAYS) window.push(0);

  const fromHistory = Math.floor(GROWTH_FACTOR * median(window));
  // The floor is a newcomer's allowance: the clamp narrows what a sender has
  // earned, it never leaves an earned sender worse off than one who arrived
  // this morning.
  return Math.min(standingDaily, Math.max(NEW_DAILY, fromHistory));
}
