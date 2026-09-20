import type { Redis } from "ioredis";

import { childLogger } from "../lib/logger";

const log = childLogger({ module: "priority-cache" });

/**
 * The tier of a sender, where the enqueue path can afford to read it.
 *
 * Ingest writes a row and a job per email, and asking Postgres for a tier on
 * each one would put a query on the hot path to look up a number that changes
 * about twice a demo. So the table is mirrored into one Redis hash, refreshed
 * hourly and on every write, and read with a single HGET.
 *
 * A miss is not an error. A cache that is empty, stale or unreachable answers
 * null and the caller falls back to the default tier, because an email that
 * arrives while Redis is restarting must still be queued.
 */
export interface PriorityCache {
  /** The tier for this domain, or null when nothing has been cached for it. */
  tierOf(domain: string): Promise<number | null>;
  /** Replaces the whole hash with what the table now says. Domains no longer in it are dropped. */
  replaceAll(tiers: Map<string, number>): Promise<void>;
  /** One domain, written the moment a person changes it, so the next email does not wait for the refresh. */
  set(domain: string, tier: number): Promise<void>;
}

export const PRIORITY_KEY = "client:priority";

export function redisPriorityCache(redis: Redis): PriorityCache {
  return {
    async tierOf(domain) {
      try {
        const value = await redis.hget(PRIORITY_KEY, domain);
        const tier = value === null ? Number.NaN : Number(value);
        return Number.isFinite(tier) ? tier : null;
      } catch (error) {
        // An email still has to be queued while Redis is away. It goes in at
        // the default tier, which is what an unranked sender gets anyway.
        log.warn({ domain, err: message(error) }, "priority cache unreadable, using the default tier");
        return null;
      }
    },
    async replaceAll(tiers) {
      // Delete and write in one round trip, so a reader never sees the gap
      // between an empty hash and a filled one.
      const pipeline = redis.multi().del(PRIORITY_KEY);
      if (tiers.size > 0) {
        pipeline.hset(PRIORITY_KEY, Object.fromEntries([...tiers].map(([domain, tier]) => [domain, String(tier)])));
      }
      await pipeline.exec();
      log.info({ domains: tiers.size }, "priority cache refreshed");
    },
    async set(domain, tier) {
      await redis.hset(PRIORITY_KEY, domain, String(tier));
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
