import type { Redis } from "ioredis";
import type { Pool } from "pg";

import type { GateBudget } from "../../contracts";
import { config } from "../../config";
import { childLogger } from "../../lib/logger";

const log = childLogger({ module: "gate-budget" });

/**
 * What today has cost, and how close that is to the day's budget.
 *
 * The one part of the gate that does not depend on believing a From header.
 * Whoever the flood claims to be, the money it spends is in core.llm_calls
 * with the rest, and this reads it.
 *
 * Summed by a scheduler every few minutes rather than on the enqueue path: it
 * is an aggregate over a table that grows all day, the number moves slowly,
 * and an email must not wait on it. The cached value is read with one GET and
 * a miss is a budget of zero, which changes nothing.
 */

export const BUDGET_KEY = "gate:budget:today";

/** Below this the budget changes nothing; at it, unknown and new senders wait. */
export const SQUEEZE_AT = 0.8;
/** At this only established and whitelisted senders are served. */
export const HALT_AT = 1;

export async function spentToday(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ spent: string | null }>(
    "select sum(cost_usd) as spent from core.llm_calls where created_at >= current_date",
  );
  return Number(rows[0]?.spent ?? 0);
}

/** The scheduler's task: read Postgres, write the one key the enqueue path reads. */
export async function refreshBudget(pool: Pool, redis: Redis): Promise<number> {
  const spent = await spentToday(pool);
  await redis.set(BUDGET_KEY, String(spent), "EX", 3600);
  log.debug({ spent }, "the day's spend was refreshed");
  return spent;
}

/**
 * A miss, a stale key or an unreachable Redis all answer zero.
 *
 * Failing to zero looks generous, and it is the right generosity: the budget
 * breaker is the backstop, not the front line, and a Redis outage must not
 * make the gate refuse every unknown sender on the strength of a number it
 * could not read. The three per-sender buckets are what is holding the line at
 * that moment, and decide.ts has its own answer for them being unreadable.
 */
export async function readBudget(redis: Redis): Promise<GateBudget> {
  const budgetUsd = config.GATE_DAILY_BUDGET_USD;
  let spentUsd = 0;
  try {
    spentUsd = Number((await redis.get(BUDGET_KEY)) ?? 0);
    if (!Number.isFinite(spentUsd)) spentUsd = 0;
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : String(error) }, "the day's spend is unreadable");
  }
  return {
    spentUsd,
    budgetUsd,
    level: budgetUsd > 0 ? spentUsd / budgetUsd : 0,
    squeezeAt: SQUEEZE_AT,
    haltAt: HALT_AT,
    readAt: new Date().toISOString(),
  };
}
