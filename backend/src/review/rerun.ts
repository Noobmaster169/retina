import type { Queryable } from "../db";
import { childLogger } from "../lib/logger";
import { emailRuns } from "../ontology/repositories";
import { DEFAULT_PRIORITY, type RerunFrom, rerunJobOptions } from "../queues/names";
import type { RunQueues } from "../queues/run-queues";

const log = childLogger({ module: "review.rerun" });

/** The slice of the queues a person's correction needs. One seam, one real implementation, one fake. */
export type ReviewQueues = Pick<RunQueues, "rerun">;

export interface RerunTarget {
  runId: string;
  emailId: string;
  emailRunId: string;
}

/**
 * Sends the email back through the pipeline from where the correction landed.
 * The count is spent first and travels in the job id: the original job is kept
 * for a day after it completes and BullMQ refuses a second under the same id,
 * so without this a rerun would be silently dropped.
 *
 * Written to Postgres before it is enqueued, as everything is: a job that
 * names a row nobody wrote is a worker looking for something that is not there.
 */
export async function requeue(db: Queryable, queues: ReviewQueues, target: RerunTarget, from: RerunFrom): Promise<"classify" | "compare"> {
  const rerun = await emailRuns.incrementRerun(db, target.emailRunId);
  const { runId, emailId } = target;
  const options = rerunJobOptions(runId, emailId, rerun, DEFAULT_PRIORITY);
  const queue = from === "classify" ? "classify" : "compare";
  await queues.rerun(queue, { runId, emailId, rerunFrom: from }, options);
  log.info({ runId, emailId, queue, rerunFrom: from, rerun }, "a person sent the email back through");
  return queue;
}
