import type { GateBucket, GateMode, GateReason, GateScope, GateStanding, GateVerdict } from "../../contracts";

import type { GateCost } from "./cost";
import { HALT_ADMITS, SQUEEZE_HOLDS } from "./standing";

/**
 * The multi-parameter function: everything known about an email and its sender
 * in, `admit` or `hold` out.
 *
 * Pure, and deliberately the only place any of these signals meet. No clock,
 * no Redis, no database, no model. The same inputs give the same verdict on
 * any machine, which is what lets the page explain a refusal in a sentence
 * instead of showing a score nobody can argue with.
 *
 * Nothing it returns is a category. An email it holds is not spam; it is an
 * email nobody has paid to read yet.
 */

/** One scope's bucket, as the meter read and charged it. */
export interface ScopeReading {
  scope: GateScope;
  principal: string;
  /** The standing this scope's own caps were derived from. */
  standing: GateStanding;
  burstCapacity: number;
  /** Units left in the burst bucket before this email was charged. */
  burstRemaining: number;
  /** Units spent today before this email was charged. */
  dailyUsed: number;
  dailyCap: number;
  /** Units the burst bucket regains per second, for the retry hint. */
  refillPerSec: number;
}

export interface DecideInput {
  mode: GateMode;
  cost: GateCost;
  /**
   * Who the verdict is about: the sender's overall standing, and the principal
   * to name. The address's policy wins over the domain's where both are set;
   * otherwise this is the domain's earned bracket, because the address scope
   * limits one mailbox inside a domain rather than describing the sender.
   */
  standing: GateStanding;
  principal: string;
  /** Address, domain and global, in the order they should be blamed. */
  readings: ScopeReading[];
  /** Today's spend over the day's budget. 1 means the budget is exactly used up. */
  budgetLevel: number;
  /** Below this the budget changes nothing. */
  squeezeAt: number;
  /** At this only the brackets in HALT_ADMITS are served. */
  haltAt: number;
  /** False when Redis could not be reached: the readings are then meaningless. */
  meterAvailable: boolean;
  /** For the retry hint on a daily refusal, since a pure function may not read a clock. */
  msUntilDayEnd: number;
}

function bucketsOf(readings: ScopeReading[]): GateBucket[] {
  return readings.map((reading) => ({
    scope: reading.scope,
    principal: reading.principal,
    burstCapacity: reading.burstCapacity,
    burstRemaining: reading.burstRemaining,
    dailyUsed: reading.dailyUsed,
    dailyCap: reading.dailyCap,
  }));
}

/** Which scope refuses first, and on which of its two limits. Address, then domain, then global. */
function refusal(readings: ScopeReading[], units: number): { reading: ScopeReading; reason: GateReason } | null {
  for (const reading of readings) {
    if (reading.dailyUsed + units > reading.dailyCap) return { reading, reason: "daily" };
    if (reading.burstRemaining < units) return { reading, reason: "burst" };
  }
  return null;
}

function retryAfterMs(reason: GateReason, reading: ScopeReading, units: number, msUntilDayEnd: number): number | null {
  if (reason === "daily") return msUntilDayEnd;
  if (reason !== "burst") return null;
  // A bucket that can never hold this email will not be able to at any later
  // time either, so there is nothing honest to promise.
  if (units > reading.burstCapacity || reading.refillPerSec <= 0) return null;
  return Math.ceil(((units - reading.burstRemaining) / reading.refillPerSec) * 1000);
}

/**
 * Why a squeezed budget refuses this sender, or null where it does not.
 *
 * It degrades by standing rather than switching everything off: an attacker
 * whose flood stops your real customers has achieved the outage they wanted.
 */
function budgetRefuses(standing: GateStanding, level: number, squeezeAt: number, haltAt: number): boolean {
  if (level >= haltAt) return !HALT_ADMITS.includes(standing);
  if (level >= squeezeAt) return SQUEEZE_HOLDS.includes(standing);
  return false;
}

/**
 * With the meter away we fall back to what we already knew rather than to a
 * default. Failing open is the attacker's best case and failing closed turns a
 * Redis restart into an outage, so a sender we trusted a minute ago on
 * evidence that has not changed is still trusted, and one we had no evidence
 * about waits.
 */
function trustedWithoutMeter(standing: GateStanding): boolean {
  return standing === "trusted" || standing === "established" || standing === "regular";
}

function verdict(input: DecideInput, decision: "admit" | "hold", reason: GateReason, scope: GateScope, retry: number | null): GateVerdict {
  return {
    decision,
    reason,
    scope,
    principal: input.principal,
    standing: input.standing,
    units: input.cost.units,
    breakdown: input.cost.breakdown,
    buckets: bucketsOf(input.readings),
    // A person's decision bites in every mode. An automatic one waits for
    // `enforce`, because a rate limiter nobody has watched in shadow first is
    // a rate limiter nobody should have switched on.
    enforced: decision === "hold" && (reason === "blocked_by_person" || input.mode === "enforce"),
    retryAfterMs: retry,
  };
}

export function decide(input: DecideInput): GateVerdict {
  const address = input.readings[0]?.scope ?? "address";

  if (input.mode === "off") return verdict(input, "admit", "ok", address, null);

  if (input.standing === "blocked") return verdict(input, "hold", "blocked_by_person", address, null);

  if (!input.meterAvailable) {
    if (trustedWithoutMeter(input.standing)) return verdict(input, "admit", "ok", address, null);
    return verdict(input, "hold", "meter_unavailable", address, null);
  }

  if (budgetRefuses(input.standing, input.budgetLevel, input.squeezeAt, input.haltAt)) {
    return verdict(input, "hold", "budget", "global", input.msUntilDayEnd);
  }

  const refused = refusal(input.readings, input.cost.units);
  if (!refused) return verdict(input, "admit", "ok", address, null);

  return verdict(
    input,
    "hold",
    refused.reason,
    refused.reading.scope,
    retryAfterMs(refused.reason, refused.reading, input.cost.units, input.msUntilDayEnd),
  );
}
