import type { Pool } from "pg";

import { childLogger } from "../../lib/logger";

const log = childLogger({ module: "analytics.repo" });

/**
 * Keeping the `analytics` materialized views level with `core`.
 *
 * Refreshed on a clock, because there is no run-completion event to hang it
 * on: `resolve-case.ts` runs per email and `processingDone` is computed in the
 * run summary rather than raised. The phase 10 spec asked for "and triggered
 * when a run reaches done + failed == total"; that second mechanism needs an
 * event this codebase does not have, and inventing one so a 520 row view can
 * refresh a few minutes sooner is not worth a new seam. This closes the
 * question rather than carrying it: the clock is the trigger.
 */

/** In dependency order. The two aggregates read fact_email_outcome and fact_field_diff, so those go first. */
const VIEWS = [
  "analytics.fact_email_outcome",
  "analytics.fact_field_diff",
  "analytics.agg_client_run",
  "analytics.agg_run_stage",
] as const;

interface Watermark {
  n: number;
  at: Date | null;
}

async function watermarkOf(db: Pool, relation: string): Promise<Watermark> {
  const { rows } = await db.query<{ n: string; at: Date | null }>(
    `select count(*)::text as n, max(coalesce(finished_at, started_at)) as at from ${relation}`,
  );
  return { n: Number(rows[0].n), at: rows[0].at };
}

/**
 * Whether `core` has moved since the views last saw it.
 *
 * Stateless on purpose: it compares the view against the table rather than
 * against a remembered timestamp, so a worker restart cannot lose the mark and
 * a refresh that failed halfway is simply still stale. An email that changed
 * stage without finishing does not move this, which is correct for what the
 * views are for: a question about an inbox is a question about outcomes, and
 * the run page reads `core` directly for anything in flight.
 */
export async function isStale(db: Pool): Promise<boolean> {
  const [core, view] = await Promise.all([
    watermarkOf(db, "core.email_runs"),
    watermarkOf(db, "analytics.fact_email_outcome"),
  ]);
  if (core.n !== view.n) return true;
  if (core.at === null || view.at === null) return core.at !== view.at;
  return core.at.getTime() !== view.at.getTime();
}

/**
 * Rebuilds every view, newest data last.
 *
 * `concurrently` so a question asked mid-refresh still reads the previous
 * answer instead of blocking or seeing an empty view; it needs the unique
 * index each view carries, and it cannot run inside a transaction, which is
 * why this takes the pool rather than a Queryable.
 */
export async function refresh(db: Pool): Promise<void> {
  const started = Date.now();
  for (const view of VIEWS) {
    await db.query(`refresh materialized view concurrently ${view}`);
  }
  log.info({ ms: Date.now() - started, views: VIEWS.length }, "refreshed the analytics views");
}

/** Refreshes only when `core` has moved. Returns whether it did, which the scheduler logs. */
export async function refreshIfStale(db: Pool): Promise<boolean> {
  if (!(await isStale(db))) return false;
  await refresh(db);
  return true;
}
