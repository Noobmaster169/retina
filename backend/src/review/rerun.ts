import type { Queryable } from "../db";
import { childLogger } from "../lib/logger";
import { emailRuns } from "../ontology/repositories";
import { type RerunFrom, rerunJobOptions } from "../queues/names";
import { computePriority } from "../queues/priority";
import type { RunQueues } from "../queues/run-queues";

const log = childLogger({ module: "review.rerun" });

/** The slice of the queues a person's correction needs. One seam, one real implementation, one fake. */
export type ReviewQueues = Pick<RunQueues, "rerun" | "readShipment">;

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
 *
 * It goes in at the priority the email already has, not at a default. A
 * correction on a tier-1 client's email is still that client's work, and
 * queueing it behind a burst of tier-3 email is the one thing a person who
 * just fixed something would never expect.
 */
export async function requeue(db: Queryable, queues: ReviewQueues, target: RerunTarget, from: RerunFrom): Promise<"classify" | "compare"> {
  const rerun = await emailRuns.incrementRerun(db, target.emailRunId);
  const { runId, emailId } = target;
  const priority = (await emailRuns.priorityOf(db, runId, emailId)) ?? computePriority({ tier: null, tonnageMt: null });
  const options = rerunJobOptions(runId, emailId, rerun, priority);
  const queue = from === "classify" ? "classify" : "compare";
  await queues.rerun(queue, { runId, emailId, rerunFrom: from }, options);
  log.info({ runId, emailId, queue, rerunFrom: from, rerun, priority }, "a person sent the email back through");
  return queue;
}

/**
 * Asks for a reading of an email a person just closed as not a comparison.
 * A queue that will not take the job is logged and dropped: the category
 * change is already committed, and a reading is never worth failing it over.
 */
export async function enqueueReading(queues: ReviewQueues, target: RerunTarget): Promise<void> {
  try {
    await queues.readShipment(target.emailId, Number(target.emailRunId));
  } catch (error) {
    log.warn({ runId: target.runId, emailId: target.emailId, err: error instanceof Error ? error.message : String(error) }, "could not queue the semantic reading");
  }
}
