import type { JobsOptions, Queue } from "bullmq";

import type { QueueCounts } from "../contracts";
import { RetryableError } from "../lib/errors";
import { runIdOfJob } from "../lib/ids";
import { withTimeout } from "../lib/time";
import { redisIsDown } from "./connection";
import { type ClassifyJob, ingestJobOptions, JOB_NAMES, releaseJobOptions } from "./names";
import { getQueues } from "./queues";

/** What the run routes need from the queues. */
export interface RunQueues {
  /** `epoch` is the run's ingest epoch: 0 for a new run, the value a resume returned after that. */
  startIngest(runId: string, jobId: string, epoch: number): Promise<void>;
  counts(): Promise<{ classify: QueueCounts; compare: QueueCounts }>;
  /** Drops the run's jobs that have not started. Returns how many. */
  removeWaiting(runId: string): Promise<number>;
  /**
   * Wakes the run's deferred jobs, so a resume restarts the queues on the
   * click rather than on each job's next recheck. Returns how many.
   */
  promoteDelayed(runId: string): Promise<number>;
  /**
   * Sends one email back through a queue after a person corrected it. The
   * options carry the rerun's own job id: the original is kept for a day after
   * it completes and BullMQ refuses a second under the same one.
   */
  rerun(queue: "classify" | "compare", data: ClassifyJob, options: JobsOptions): Promise<void>;
  /**
   * Sends one email the gate held back through ingest, with the gate bypassed.
   * On the ingest queue and not inline, because a release still has to copy
   * the attachments nobody copied the first time.
   */
  releaseEmail(runId: string, emailId: string): Promise<void>;
}

// With Redis down a command waits for the reconnect forever. An HTTP request cannot.
const REDIS_TIMEOUT_MS = 5000;

async function bounded<T>(work: () => Promise<T>, label: string): Promise<T> {
  // Refused before the command is issued: one issued now would be delivered on
  // reconnect, after the caller was told it failed.
  if (redisIsDown()) throw new RetryableError(`queue unavailable: ${label}`);
  try {
    return await withTimeout(work(), REDIS_TIMEOUT_MS, label);
  } catch (error) {
    throw new RetryableError(`queue unavailable: ${label}`, { cause: error });
  }
}

// A job with a priority waits in `prioritized`, not `waiting`. Every email job has one.
const NOT_STARTED = ["waiting", "prioritized", "delayed"] as const;

async function countsOf(queue: Queue): Promise<QueueCounts> {
  const counts = await queue.getJobCounts(...NOT_STARTED, "active", "failed");
  return {
    waiting: NOT_STARTED.reduce((sum, state) => sum + (counts[state] ?? 0), 0),
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
  };
}

async function jobsOfRun(queue: Queue, runId: string, types: Parameters<Queue["getJobs"]>[0]) {
  const jobs = await queue.getJobs(types);
  return jobs.filter((job) => job.id !== undefined && runIdOfJob(job.id) === runId);
}

async function removeRunJobs(queue: Queue, runId: string): Promise<number> {
  const mine = await jobsOfRun(queue, runId, [...NOT_STARTED]);
  // A job that went active in between refuses removal. Its processor sees the cancelled run and stops.
  const removals = await Promise.allSettled(mine.map((job) => job.remove()));
  return removals.filter((removal) => removal.status === "fulfilled").length;
}

/**
 * Every delayed job of this run back to waiting. A job the pause gate parked
 * is the point of it; one waiting out a retry backoff is promoted too, which
 * is the same answer a person clicking Resume would give.
 */
async function promoteRunJobs(queue: Queue, runId: string): Promise<number> {
  const mine = await jobsOfRun(queue, runId, ["delayed"]);
  // A job whose delay elapsed in between is no longer delayed and refuses promotion. It is already awake.
  const promotions = await Promise.allSettled(mine.map((job) => job.promote()));
  return promotions.filter((promotion) => promotion.status === "fulfilled").length;
}

export function bullRunQueues(): RunQueues {
  return {
    async startIngest(runId, jobId, epoch) {
      await bounded(
        () => getQueues().ingest.add(JOB_NAMES.ingest, { runId, epoch }, ingestJobOptions(jobId)),
        "start ingest",
      );
    },
    async counts() {
      const { classify, compare } = getQueues();
      const [classifyCounts, compareCounts] = await bounded(
        () => Promise.all([countsOf(classify), countsOf(compare)]),
        "queue counts",
      );
      return { classify: classifyCounts, compare: compareCounts };
    },
    async releaseEmail(runId, emailId) {
      await bounded(
        () => getQueues().ingest.add(JOB_NAMES.release, { runId, emailId }, releaseJobOptions(runId, emailId)),
        "release an email",
      );
    },
    async rerun(queue, data, options) {
      await bounded(() => getQueues()[queue].add(JOB_NAMES[queue], data, options), `rerun on ${queue}`);
    },
    async removeWaiting(runId) {
      const { classify, compare } = getQueues();
      const removed = await bounded(
        () => Promise.all([removeRunJobs(classify, runId), removeRunJobs(compare, runId)]),
        "remove waiting jobs",
      );
      return removed[0] + removed[1];
    },
    async promoteDelayed(runId) {
      const { classify, compare } = getQueues();
      const promoted = await bounded(
        () => Promise.all([promoteRunJobs(classify, runId), promoteRunJobs(compare, runId)]),
        "wake deferred jobs",
      );
      return promoted[0] + promoted[1];
    },
  };
}
