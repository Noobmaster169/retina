import type { JobsOptions } from "bullmq";
import { z } from "zod";

import { jobId } from "../lib/ids";

export const QUEUES = { ingest: "ingest", classify: "classify", compare: "compare" } as const;

export const JOB_NAMES = {
  ingest: "ingest-run",
  classify: "classify-email",
  compare: "compare-email",
} as const;

/** `epoch` is the run's ingest epoch when the job was added. A job from before it existed holds 0. */
export const IngestJob = z.object({ runId: z.uuid(), epoch: z.number().int().min(0).default(0) });
export type IngestJob = z.infer<typeof IngestJob>;

export const ClassifyJob = z.object({ runId: z.uuid(), emailId: z.string().min(1) });
export type ClassifyJob = z.infer<typeof ClassifyJob>;

export const CompareJob = ClassifyJob.extend({ rerunFrom: z.enum(["triage", "extract", "compare"]).optional() });
export type CompareJob = z.infer<typeof CompareJob>;

/** Every email until phase 9 replaces the constant with client tier and tonnage. */
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

export function ingestJobOptions(id: string): JobsOptions {
  return { ...RETRY, jobId: id };
}

/** The slice of a BullMQ queue that producers use, so tests can record adds without Redis. */
export interface JobAdder<T> {
  add(name: string, data: T, options: JobsOptions): Promise<unknown>;
}
