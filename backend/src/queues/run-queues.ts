import type { Queue } from "bullmq";

import type { QueueCounts } from "../contracts";
import { RetryableError } from "../lib/errors";
import { runIdOfJob } from "../lib/ids";
import { withTimeout } from "../lib/time";
import { redisIsDown } from "./connection";
import { ingestJobOptions, JOB_NAMES } from "./names";
import { getQueues } from "./queues";

/** What the run routes need from the queues. */
export interface RunQueues {
  /** `epoch` is the run's ingest epoch: 0 for a new run, the value a resume returned after that. */
  startIngest(runId: string, jobId: string, epoch: number): Promise<void>;
  counts(): Promise<{ classify: QueueCounts; compare: QueueCounts }>;
  /** Drops the run's jobs that have not started. Returns how many. */
  removeWaiting(runId: string): Promise<number>;
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

async function removeRunJobs(queue: Queue, runId: string): Promise<number> {
  const jobs = await queue.getJobs([...NOT_STARTED]);
  const mine = jobs.filter((job) => job.id !== undefined && runIdOfJob(job.id) === runId);
  // A job that went active in between refuses removal. Its processor sees the cancelled run and stops.
  const removals = await Promise.allSettled(mine.map((job) => job.remove()));
  return removals.filter((removal) => removal.status === "fulfilled").length;
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
    async removeWaiting(runId) {
      const { classify, compare } = getQueues();
      const removed = await bounded(
        () => Promise.all([removeRunJobs(classify, runId), removeRunJobs(compare, runId)]),
        "remove waiting jobs",
      );
      return removed[0] + removed[1];
    },
  };
}
