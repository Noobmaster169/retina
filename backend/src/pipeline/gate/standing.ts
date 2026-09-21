import type { GatePolicy, GateStanding } from "../../contracts";

/**
 * What a sender has earned.
 *
 * Standing is earned by distinct active days and never by volume. That is the
 * whole idea: a sender cannot buy allowance by sending more, only by having
 * existed, and sent something, on more separate days. A flood on day one is
 * `unknown` however much of it there is, and a domain that has been mailing us
 * for two months is `established` even if it sends twice a week.
 *
 * Pure: two integers and a policy in, a bracket and its two caps out. No clock
 * is read here; the caller works out the days.
 */

export interface StandingInput {
  /** What a person decided, or `auto` where nobody has. */
  policy: GatePolicy;
  /** Distinct days this principal has sent at least one email on. */
  daysSeen: number;
  /** Days since the first one arrived. 0 for a principal first seen today. */
  ageDays: number;
}

export interface StandingResult {
  standing: GateStanding;
  /** Units the burst bucket holds when full. */
  burst: number;
  /** Units a day, before the growth clamp in growth.ts narrows it further. */
  daily: number;
}

/**
 * The ladder, most privileged first, first match wins.
 *
 * The two human decisions sit at the ends and the three earned brackets in the
 * middle. Nothing can skip a rung, because the conditions are on days and days
 * pass at one rate.
 */
const LADDER: { standing: GateStanding; burst: number; daily: number }[] = [
  { standing: "established", burst: 300, daily: 6000 },
  { standing: "regular", burst: 120, daily: 1200 },
  { standing: "new", burst: 45, daily: 300 },
  { standing: "unknown", burst: 15, daily: 60 },
];

/** A blacklisted sender is held; a whitelisted one is still metered, and simply never refused for it. */
const BLOCKED = { standing: "blocked", burst: 0, daily: 0 } as const;
const TRUSTED = { standing: "trusted", burst: 600, daily: 20_000 } as const;

/** `new` is the floor the growth clamp may never take an earned sender below. See growth.ts. */
export const NEW_DAILY = 300;

const ESTABLISHED_DAYS_SEEN = 10;
const ESTABLISHED_AGE_DAYS = 30;
const REGULAR_DAYS_SEEN = 3;
const REGULAR_AGE_DAYS = 7;

function earned(daysSeen: number, ageDays: number): GateStanding {
  if (daysSeen >= ESTABLISHED_DAYS_SEEN && ageDays >= ESTABLISHED_AGE_DAYS) return "established";
  if (daysSeen >= REGULAR_DAYS_SEEN && ageDays >= REGULAR_AGE_DAYS) return "regular";
  if (daysSeen >= 1) return "new";
  return "unknown";
}

export function standingOf({ policy, daysSeen, ageDays }: StandingInput): StandingResult {
  if (policy === "block") return { ...BLOCKED };
  if (policy === "allow") return { ...TRUSTED };

  const standing = earned(Math.max(0, Math.floor(daysSeen)), Math.max(0, Math.floor(ageDays)));
  const rung = LADDER.find((one) => one.standing === standing);
  // Unreachable: `earned` only ever answers with a rung that is on the ladder.
  if (!rung) throw new Error(`no rung for standing ${standing}`);
  return { standing: rung.standing, burst: rung.burst, daily: rung.daily };
}

/** Which brackets a squeezed budget still serves. Read by decide.ts, kept here with the ladder it ranks. */
export const SQUEEZE_HOLDS: GateStanding[] = ["unknown", "new"];
export const HALT_ADMITS: GateStanding[] = ["trusted", "established"];
