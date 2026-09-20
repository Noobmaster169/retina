import type { Job, Queue } from "bullmq";

import { childLogger } from "../lib/logger";

const log = childLogger({ module: "aging" });

/**
 * Nothing waits forever behind a busier client.
 *
 * BullMQ serves the lowest number first, so subtracting from a job's priority
 * moves it up the queue. A tier-5 email in a burst of tier-1 work would
 * otherwise sit at 1000 until the burst ended; every five minutes it waits, it
 * gains a tier's worth of urgency, and after four passes it is ahead of
 * everything that arrived after it.
 *
 * A rerun a person asked for is not exempt. Aging only ever promotes, so
 * exempting it would mean holding a correction back, which is the opposite of
 * what the exemption would be for.
 */

/** How long a job waits before it is worth promoting. */
export const AGE_AFTER_MS = 5 * 60 * 1000;

/** How much urgency one pass is worth: a whole tier, so four passes clear the whole range. */
export const AGE_STEP = 100;

/**
 * Past this, a job is already as urgent as a priority can make it. 0 is not
 * the next step down: BullMQ reads 0 as "no explicit priority" and serves
 * those ahead of every prioritised job, so aging into it would put a tier-5
 * email in front of a tier-1 one. A job already at 0 is left alone for the
 * same reason, from the other side.
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

/** One pass over one queue. Returns what it did, so the scheduler can log it and a test can assert it. */
export async function ageWaitingJobs(queue: Queue, now = Date.now()): Promise<AgingResult> {
  const jobs = await queue.getJobs([...WAITING], 0, SCAN_LIMIT);
  const stale = jobs.filter((job) => now - job.timestamp > AGE_AFTER_MS && priorityOf(job) > MOST_URGENT);

  let promoted = 0;
  for (const job of stale) {
    const was = priorityOf(job);
    const raised = Math.max(MOST_URGENT, was - AGE_STEP);
    try {
      await job.changePriority({ priority: raised });
      promoted += 1;
      log.info({ queue: queue.name, jobId: job.id, was, priority: raised }, "promoted a job that had waited");
    } catch (error) {
      // A job that started, finished or was removed between the read and the
      // write is not an error: it is no longer waiting, which is the outcome
      // this job wanted anyway.
      log.debug({ queue: queue.name, jobId: job.id, err: message(error) }, "could not promote a job");
    }
  }
  return { scanned: jobs.length, promoted };
}

/**
 * `job.priority`, never `job.opts.priority`. The options hold what the job was
 * added with and `changePriority` does not touch them, so reading them made
 * every pass after the first compute the same first step again: a job went
 * from 1000 to 900 and stayed there however long it waited.
 */
function priorityOf(job: Job): number {
  return job.priority ?? job.opts.priority ?? 0;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
