import { DEFAULT_TIER } from "../contracts";

/**
 * What a job's place in the queue is worth. Pure: a tier and a tonnage in, a
 * number out. Nothing here reads Redis, the database or an email.
 *
 * BullMQ serves the lowest number first, so a smaller result is more urgent.
 * The tier is the decision a person made about a client and dominates; the
 * tonnage only ever breaks a tie inside one tier, which is why the bonus is
 * capped below the 200 that separates two tiers. Without that cap a big
 * shipment from a tier-3 forwarder would overtake a tier-1 client, and the
 * tier would no longer mean what the /clients page says it means.
 */

/** Where the tiers sit: 200 apart, so no tonnage bonus can cross from one into the next. */
const TIER_SPAN = 200;

/** One point per 10 MT, stopping at 99 so the bonus can never span a tier. */
const MT_PER_POINT = 10;
const MAX_BONUS = 99;

export interface PriorityInput {
  /** From core.clients, through the Redis cache. Null for a domain with no row. */
  tier: number | null;
  /** Parsed from the subject at ingest. Null when the subject names no shipment size. */
  tonnageMt: number | null;
}

/**
 * The job priority for one email: 101 for the largest tier-1 shipment, 1000
 * for a tier-5 email with no tonnage. Always at least 1, because BullMQ reads
 * 0 as "no priority at all" and would drop the job out of the ordering.
 */
export function computePriority({ tier, tonnageMt }: PriorityInput): number {
  const rank = clampTier(tier ?? DEFAULT_TIER);
  const tonnage = Math.max(tonnageMt ?? 0, 0);
  const bonus = Math.min(Math.floor(tonnage / MT_PER_POINT), MAX_BONUS);
  return rank * TIER_SPAN - bonus;
}

/** A tier out of range is a row written before the check constraint, or a cache holding something stale. */
function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) return DEFAULT_TIER;
  return Math.min(Math.max(Math.round(tier), 1), 5);
}
