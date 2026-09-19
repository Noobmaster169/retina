import { randomUUID } from "node:crypto";

export function newRunId(): string {
  return randomUUID();
}

/**
 * One job per email per run, so adding it twice is a no-op and a retry can
 * never create a duplicate. The separator is not ":" because BullMQ rejects
 * custom ids that contain one.
 */
export function jobId(runId: string, emailId: string): string {
  return `${runId}__${emailId}`;
}

/** The ingest job that resumes a paused run. One per epoch, so a repeated resume cannot add two. */
export function resumeJobId(runId: string, epoch: number): string {
  return `${runId}__resume__${epoch}`;
}

export function runIdOfJob(id: string): string {
  return id.split("__")[0];
}
