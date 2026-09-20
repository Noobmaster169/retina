import type { JobsOptions } from "bullmq";
import { z } from "zod";

import { jobId } from "../lib/ids";

export const QUEUES = { ingest: "ingest", classify: "classify", compare: "compare", scheduler: "scheduler" } as const;

export const JOB_NAMES = {
  ingest: "ingest-run",
  classify: "classify-email",
  compare: "compare-email",
} as const;

/** `epoch` is the run's ingest epoch when the job was added. A job from before it existed holds 0. */
export const IngestJob = z.object({ runId: z.uuid(), epoch: z.number().int().min(0).default(0) });
export type IngestJob = z.infer<typeof IngestJob>;

/**
 * Where a rerun a person asked for starts from. Absent on the pipeline's own
 * jobs, and its presence is what lets a job pick an email up again from
 * `review`, `done` or `failed`, which the pipeline itself never may.
 */
export const RerunFrom = z.enum(["classify", "triage", "compare"]);
export type RerunFrom = z.infer<typeof RerunFrom>;

export const ClassifyJob = z.object({
  runId: z.uuid(),
  emailId: z.string().min(1),
  rerunFrom: RerunFrom.optional(),
});
export type ClassifyJob = z.infer<typeof ClassifyJob>;

/** The same ids as a classify job. Phase 8's partial rerun is the reason this has its own name. */
export const CompareJob = ClassifyJob;
export type CompareJob = z.infer<typeof CompareJob>;

/**
 * What a job is worth when nothing said. Every email job is added with a real
 * priority from queues/priority.ts; this is what the classify processor
 * forwards to compare for a job added before that existed, or by a test that
 * did not care. It is deliberately the same number an unranked sender gets.
 */
export const DEFAULT_PRIORITY = 600;

const RETRY: Pick<JobsOptions, "attempts" | "backoff" | "removeOnComplete" | "removeOnFail"> = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 86_400 },
  // Kept for inspection; from phase 8 also mirrored to review_cases.
  removeOnFail: false,
};

export function jobOptions(runId: string, emailId: string, priority: number): JobsOptions {
  return { ...RETRY, jobId: jobId(runId, emailId), priority };
}

/**
 * A rerun a person set off. It carries the email run's rerun count in its id,
 * because the original job is kept for a day after it completes and BullMQ
 * refuses a second job under an id it already holds.
 */
export function rerunJobOptions(runId: string, emailId: string, rerun: number, priority: number): JobsOptions {
  return { ...RETRY, jobId: `${jobId(runId, emailId)}__r${rerun}`, priority };
}

export function ingestJobOptions(id: string): JobsOptions {
  return { ...RETRY, jobId: id };
}

/** The slice of a BullMQ queue that producers use, so tests can record adds without Redis. */
export interface JobAdder<T> {
  add(name: string, data: T, options: JobsOptions): Promise<unknown>;
}
