import type { Job, Queue } from "bullmq";

import { childLogger } from "../lib/logger";

const log = childLogger({ module: "aging" });

/**
 * Nothing waits forever behind a busier client.
 *
 * BullMQ serves the lowest number first, so subtracting from a job's priority
 * moves it up the queue. A tier-5 email in a burst of tier-1 work would
 * otherwise sit at 1000 until the burst ended; for every five minutes it
 * waits it gains a step, and ten steps take it to the front.
 *
 * A rerun a person asked for is not exempt. Aging only ever promotes, so
 * exempting it would mean holding a correction back, which is the opposite of
 * what the exemption would be for.
 */

/** How long a job waits to earn one step. */
export const AGE_AFTER_MS = 5 * 60 * 1000;

/** How much urgency one step is worth: half the 200 between two tiers, so a job climbs rather than leaps. */
export const AGE_STEP = 100;

/**
 * Past this, a job is already as urgent as a priority can make it. 0 is not
 * the next step down: BullMQ reads 0 as "no explicit priority" and serves
 * those ahead of every prioritised job, so aging into it would put a tier-5
 * email in front of a tier-1 one. A job added without a priority is left alone
 * for the same reason, from the other side.
 */
const MOST_URGENT = 1;

/** How many waiting jobs one pass looks at. A burst is 520; this covers it with room. */
const SCAN_LIMIT = 500;

/** A job with a priority waits in `prioritized`, not `waiting`. Every email job has one. */
const WAITING = ["waiting", "prioritized"] as const;

export interface AgingResult {
  scanned: number;
  promoted: number;
}

/**
 * What this job should be worth by now, or null when it is already there.
 *
 * Computed from how long it has waited rather than by subtracting a step from
 * what it is worth now, and that is the whole point: BullMQ never updates
 * `job.timestamp`, so a pass that subtracted would promote the same job again
 * on every run. Once past the threshold a job would gain a step a minute
 * instead of a step per five, reach the front about nine minutes later, and
 * outrank every tier-1 email that arrived after it. The tier would stop
 * meaning what the clients page says it means, quietly.
 *
 * `job.opts.priority` is what the job was added with, and `changePriority`
 * does not touch it. That is a nuisance everywhere else in this codebase and
 * exactly what is wanted here: it is the fixed point the ladder is measured
 * from, which is what makes a pass idempotent and a restart harmless.
 */
function targetFor(job: Job, now: number): number | null {
  const added = job.opts.priority ?? 0;
  const current = job.priority ?? added;
  if (added <= MOST_URGENT || current <= MOST_URGENT) return null;

  const steps = Math.floor((now - job.timestamp) / AGE_AFTER_MS);
  if (steps < 1) return null;

  const target = Math.max(MOST_URGENT, added - steps * AGE_STEP);
  return target < current ? target : null;
}

/** One pass over one queue. Returns what it did, so the scheduler can log it and a test can assert it. */
export async function ageWaitingJobs(queue: Queue, now = Date.now()): Promise<AgingResult> {
  const jobs = await queue.getJobs([...WAITING], 0, SCAN_LIMIT);

  let promoted = 0;
  for (const job of jobs) {
    const target = targetFor(job, now);
    if (target === null) continue;
    const was = job.priority ?? job.opts.priority ?? 0;
    try {
      await job.changePriority({ priority: target });
      promoted += 1;
      log.info({ queue: queue.name, jobId: job.id, was, priority: target }, "promoted a job that had waited");
    } catch (error) {
      // A job that started, finished or was removed between the read and the
      // write is not an error: it is no longer waiting, which is the outcome
      // this job wanted anyway.
      log.debug({ queue: queue.name, jobId: job.id, err: message(error) }, "could not promote a job");
    }
  }
  return { scanned: jobs.length, promoted };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
