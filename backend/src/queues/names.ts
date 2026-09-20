import type { JobsOptions } from "bullmq";
import { z } from "zod";

import { jobId } from "../lib/ids";

export const QUEUES = { ingest: "ingest", classify: "classify", compare: "compare", ontology: "ontology", scheduler: "scheduler" } as const;

export const JOB_NAMES = {
  ingest: "ingest-run",
  classify: "classify-email",
  compare: "compare-email",
  ontology: "read-shipment",
  // Two maintenance jobs on the same queue. They do model work, so they belong
  // on a queue sized for it and not on the clock's own queue, which runs at
  // concurrency 1 and also carries the heartbeat: a profile pass that took
  // minutes there would let the heartbeat's key expire and `/health` would
  // report a working worker as dead.
  profiles: "refresh-profiles",
  concepts: "backfill-concepts",
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
 * One email's semantic reading: what the mail states, and the things it names.
 *
 * Ids only, like every other payload. The job id is the email id and not
 * `runId__emailId`: a sighting belongs to the email and not to a run, so a
 * second enqueue while one waits is the same work and BullMQ's refusal of a
 * duplicate id is exactly the behaviour wanted.
 */
export const OntologyJob = z.object({ emailId: z.string().min(1), emailRunId: z.number().int().positive() });
export type OntologyJob = z.infer<typeof OntologyJob>;

/** A maintenance pass carries no ids: the task's own name is the whole job. */
export type MaintenancePass = Record<string, never>;

/** Everything the ontology queue carries. The worker tells them apart by `job.name`. */
export type OntologyWork = OntologyJob | MaintenancePass;

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

/**
 * Lower than any email job, which top out at 1000 (tier 5 with no tonnage).
 * BullMQ serves the smallest number first and reads 0 as no priority at all,
 * so this is a number and not a zero.
 */
export const ONTOLOGY_PRIORITY = 2000;

/**
 * A maintenance pass, enqueued by the clock and run by the ontology worker.
 *
 * The job id is the task's own name, so a tick that lands while the last one
 * is still running is a no-op rather than a second pass over the same rows.
 * One attempt: the next tick is the retry, and it is ten minutes away.
 */
export function maintenanceJobOptions(name: string): JobsOptions {
  return {
    attempts: 1,
    // Removed either way, because the job id is the task's own name: a failed
    // one kept for an hour would hold that id and every tick in that hour
    // would be refused as a duplicate, silently. The next tick is the retry
    // and the worker's `failed` listener is where the reason is written.
    removeOnComplete: true,
    removeOnFail: true,
    jobId: name,
    priority: ONTOLOGY_PRIORITY,
  };
}

export function ontologyJobOptions(emailId: string): JobsOptions {
  return {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    // Removed on completion, unlike every other queue's, because the job id is
    // the email id: a finished job kept for a day would hold that id and
    // silently refuse the re-reading a reviewer's correction asks for. A
    // failure is kept an hour, which is long enough to read and short enough
    // not to block the correction that fixes it.
    removeOnComplete: true,
    removeOnFail: { age: 3600 },
    jobId: emailId,
    priority: ONTOLOGY_PRIORITY,
  };
}

export function ingestJobOptions(id: string): JobsOptions {
  return { ...RETRY, jobId: id };
}

/** The slice of a BullMQ queue that producers use, so tests can record adds without Redis. */
export interface JobAdder<T> {
  add(name: string, data: T, options: JobsOptions): Promise<unknown>;
}

/** What the clock needs of the ontology queue: somewhere to put a maintenance pass. */
export type MaintenanceAdder = JobAdder<MaintenancePass>;
