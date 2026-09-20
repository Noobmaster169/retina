import type { Job } from "bullmq";

import type { Queryable } from "../db";
import { childLogger } from "../lib/logger";
import { emailRuns, reviewCases } from "../ontology/repositories";
import { isFinalFailure } from "./failure-policy";

const log = childLogger({ module: "record-failure" });

/** The top of a stack, which is what a reviewer can read. The whole thing belongs in the log. */
function head(stack: string | undefined): string[] {
  return (stack ?? "")
    .split("\n")
    .slice(0, 5)
    .map((line) => line.trim());
}

/** What the queue knows about the job that failed. Everything else on a BullMQ job is the worker's business. */
export type FailedJob = Pick<Job, "attemptsMade" | "opts" | "id">;

/**
 * What a failed job leaves behind. An attempt still to come is a counter; a
 * job that will not be handed to a worker again fails the email and opens a
 * case for it.
 *
 * That case carries no review reason. A failure is not one of the organisers'
 * four, the email is reported as incomplete rather than escalated, and the
 * only thing a person can answer it with is `retry`.
 */
export async function recordJobFailure(
  db: Queryable,
  job: FailedJob,
  ids: { runId: string; emailId: string },
  stage: string,
  error: Error,
): Promise<void> {
  const { runId, emailId } = ids;
  if (!isFinalFailure(job, error)) {
    log.warn({ runId, emailId, stage, attempt: job.attemptsMade, err: error.message }, "job failed, will retry");
    await emailRuns.incrementAttempt(db, runId, emailId);
    return;
  }

  log.error({ runId, emailId, stage, err: error.message }, "job failed for good");
  await emailRuns.setStage(db, runId, emailId, "failed", { error: error.message, finished: true });
  const emailRunId = await emailRuns.idOf(db, runId, emailId);
  if (!emailRunId) return;
  await reviewCases.openFailure(db, {
    emailRunId,
    stage,
    detail: { message: error.message, stack: head(error.stack), attempts: job.attemptsMade, jobId: job.id ?? null },
  });
}
