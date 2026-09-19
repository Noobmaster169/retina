import { type Job, UnrecoverableError, Worker } from "bullmq";

import { DependencyUnavailableError } from "../lib/errors";
import { childLogger } from "../lib/logger";

const log = childLogger({ module: "failure-policy" });

/** The slice of a BullMQ queue that stops every worker taking jobs from it for a while. */
export interface QueuePauser {
  rateLimit(expireTimeMs: number): Promise<void>;
}

export const LLM_OUTAGE_PAUSE_MS = 30_000;

/** BullMQ's own failure for a job whose worker died more often than maxStalledCount allows. It is never retried. */
const STALLED_OUT = "job stalled more than allowable limit";

/**
 * With the model or doc-extract unreachable, every job would burn its three
 * attempts within seconds and the run's emails would fail for good. Instead the
 * queue pauses and the job goes back to wait with its attempts untouched.
 */
export async function pausingOnOutage<T>(queue: QueuePauser, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof DependencyUnavailableError)) throw error;
    log.warn({ err: error.message, pauseMs: LLM_OUTAGE_PAUSE_MS }, "dependency unavailable, pausing the queue");
    await queue.rateLimit(LLM_OUTAGE_PAUSE_MS);
    throw Worker.RateLimitError();
  }
}

/** True when BullMQ will not hand this job to a worker again, so the email must be recorded as failed. */
export function isFinalFailure(job: Pick<Job, "attemptsMade" | "opts">, error: Error): boolean {
  if (error instanceof UnrecoverableError || error.message.includes(STALLED_OUT)) return true;
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}
