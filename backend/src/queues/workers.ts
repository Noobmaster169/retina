import { DelayedError, type Job, UnrecoverableError, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { z } from "zod";

import type { LlmClient } from "../agents";
import { config } from "../config";
import { transactor } from "../db";
import type { DocExtractClient } from "../doc-extract";
import { type IngestDeps, replayRun } from "../ingest";
import { TerminalError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import type { LiveCalls } from "../live";
import { emailRuns, runs } from "../ontology/repositories";
import { isFinalFailure, type PausedAt, pausingOnOutage, type QueuePauser } from "./failure-policy";
import { recordJobFailure } from "./record-failure";
import { ClassifyJob, CompareJob, DEFAULT_PRIORITY, IngestJob, type JobAdder, JOB_NAMES, OntologyJob, ontologyJobOptions, QUEUES } from "./names";
import { processClassify } from "./processors/classify.processor";
import { processCompare } from "./processors/compare.processor";
import { backfillConcepts } from "./backfill-concepts";
import { processOntology } from "./processors/ontology.processor";
import { queueOntology } from "./queue-ontology";
import { refreshProfiles } from "./refresh-profiles";

const log = childLogger({ module: "workers" });

export interface WorkerDeps extends IngestDeps {
  llm: LlmClient;
  docExtract: DocExtractClient;
  live?: LiveCalls;
  classify: JobAdder<ClassifyJob> & QueuePauser;
  compare: JobAdder<CompareJob> & QueuePauser;
  /** The semantic layer's own queue. Absent, the compare leg simply never enqueues one. */
  ontology?: JobAdder<OntologyJob> & QueuePauser;
}

// LLM calls are slow, so an email job may hold its lock for a while. A job
// stalls once per worker restart that catches it mid-call, and a deploy is a
// restart, so the default of one stall would fail emails that did nothing wrong.
const EMAIL_LOCK = { lockDuration: 120_000, stalledInterval: 30_000, maxStalledCount: 10 };
// BullMQ honours a manual rate limit only on a worker that has a limiter. This
// one is never reached; it exists so `rateLimit` below takes effect.
const NEVER_REACHED_LIMITER = { max: 10_000, duration: 1000 };
// An ingest job is only ever waiting on the inbox, and a run sits idle until a
// dead worker's job is declared stalled, so that is noticed quickly. It may
// stall once per worker restart, hence the generous count.
const INGEST_LOCK = { lockDuration: 30_000, stalledInterval: 15_000, maxStalledCount: 10 };
const INGEST_CONCURRENCY = 4;
const REQUEUE_DELAY_MS = 2000;

function parse<S extends z.ZodType>(schema: S, job: Job): z.infer<S> {
  const parsed = schema.safeParse(job.data);
  if (!parsed.success) throw new TerminalError(`job ${job.id} has a bad payload`, { cause: parsed.error });
  return parsed.data;
}

/** A TerminalError would fail the same way again, so BullMQ is told not to retry it. */
async function noRetryOnTerminal<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TerminalError) throw new UnrecoverableError(error.message);
    throw error;
  }
}

/** Where a pause happened, for the one log line nobody can afford to find unattributed. */
function at(stage: string, job: Job, data: ClassifyJob): PausedAt {
  return { stage, jobId: job.id, runId: data.runId, emailId: data.emailId };
}

type FailedListener = (job: Job | undefined, error: Error) => Promise<void>;

/**
 * An emitter drops the promise a listener returns, so a rejection in one
 * would be unhandled and take the worker down. Often the database outage
 * that failed the job is the same one that fails the bookkeeping.
 */
function guarded(queue: string, record: FailedListener) {
  return async (job: Job | undefined, error: Error): Promise<void> => {
    try {
      await record(job, error);
    } catch (recordError) {
      const err = recordError instanceof Error ? recordError.message : String(recordError);
      log.error({ queue, jobId: job?.id, err }, "could not record a job failure");
    }
  };
}

function onEmailJobFailed(deps: WorkerDeps, stage: string): FailedListener {
  return async (job, error) => {
    const data = ClassifyJob.safeParse(job?.data);
    if (!job || !data.success) return;
    await recordJobFailure(deps.pool, job, data.data, stage, error);
  };
}

function onIngestJobFailed(deps: WorkerDeps): FailedListener {
  return async (job, error) => {
    const data = IngestJob.safeParse(job?.data);
    if (!job || !data.success || !isFinalFailure(job, error)) return;
    log.error({ runId: data.data.runId, err: error.message }, "ingest failed for good");
    await runs.setStatus(deps.pool, data.data.runId, "failed", ["created", "running"]);
  };
}

export interface RunningWorkers {
  /** Lets running jobs finish, asks the ingest loop to hand its run back, then closes. */
  stop(): Promise<void>;
}

export function startWorkers(deps: WorkerDeps, connection: Redis): RunningWorkers {
  let stopping = false;

  const ingest = new Worker(
    QUEUES.ingest,
    (job, token) =>
      noRetryOnTerminal(async () => {
        const outcome = await replayRun(deps, parse(IngestJob, job), {
          stopping: () => stopping,
          onProgress: (fraction) => job.updateProgress(Math.round(fraction * 100)),
        });
        if (outcome !== "interrupted") return;
        // Hand the run to whichever worker is up next, without spending an attempt.
        await job.moveToDelayed(Date.now() + REQUEUE_DELAY_MS, token);
        throw new DelayedError();
      }),
    { connection, concurrency: INGEST_CONCURRENCY, ...INGEST_LOCK },
  );

  const classify = new Worker(
    QUEUES.classify,
    (job) => {
      const data = parse(ClassifyJob, job);
      return noRetryOnTerminal(() =>
        pausingOnOutage(deps.classify, at("classify", job, data), () =>
          // `job.priority`, not `job.opts.priority`: the options hold what the
          // job was added with and the aging pass does not touch them, so
          // reading them would hand the compare job the priority this one had
          // before it waited, and the compare leg would earn every promotion
          // again from scratch.
          processClassify(deps, data, job.priority ?? job.opts.priority ?? DEFAULT_PRIORITY),
        ),
      );
    },
    { connection, concurrency: config.CLASSIFY_CONCURRENCY, limiter: NEVER_REACHED_LIMITER, ...EMAIL_LOCK },
  );

  const compare = new Worker(
    QUEUES.compare,
    async (job) => {
      const data = parse(CompareJob, job);
      await noRetryOnTerminal(() => pausingOnOutage(deps.compare, at("compare", job, data), () => processCompare(deps, data)));
      await queueOntology(deps, data);
    },
    { connection, concurrency: config.COMPARE_CONCURRENCY, limiter: NEVER_REACHED_LIMITER, ...EMAIL_LOCK },
  );

  // Its own queue, at the lowest priority, so a reading can never slow or fail
  // a scored email. An outage pauses it exactly as it pauses the other two.
  const ontology = new Worker(
    QUEUES.ontology,
    async (job) => {
      // Three job names on one queue: one email's reading, and the two
      // maintenance passes the clock enqueues rather than running itself.
      if (job.name === JOB_NAMES.profiles) return void (await refreshProfiles(deps));
      if (job.name === JOB_NAMES.concepts) return void (await backfillConcepts(deps));

      const data = parse(OntologyJob, job);
      const pauser = deps.ontology;
      const read = () => processOntology({ ...deps, tx: transactor(deps.pool) }, data);
      return noRetryOnTerminal(() =>
        pauser ? pausingOnOutage(pauser, { stage: "ontology", jobId: job.id, runId: "", emailId: data.emailId }, read) : read(),
      );
    },
    { connection, concurrency: config.ONTOLOGY_CONCURRENCY, limiter: NEVER_REACHED_LIMITER, ...EMAIL_LOCK },
  );

  ingest.on("failed", guarded(QUEUES.ingest, onIngestJobFailed(deps)));
  classify.on("failed", guarded(QUEUES.classify, onEmailJobFailed(deps, "classify")));
  compare.on("failed", guarded(QUEUES.compare, onEmailJobFailed(deps, "compare")));
  // No review case and no stage change: a reading that failed leaves the
  // email's verdict exactly where it was, which is the point of this queue.
  // The only record a failed ontology job leaves: no review case and no stage
  // change, because this queue may never fail or slow a scored email. The job
  // itself is removed, so this line is the reason and there is no second copy.
  ontology.on("failed", (job, error) => log.warn({ jobId: job?.id, job: job?.name, err: error.message }, "an ontology job failed"));

  const workers = [ingest, classify, compare, ontology];
  for (const worker of workers) {
    worker.on("error", (error) => log.warn({ queue: worker.name, err: error.message }, "worker error"));
  }

  return {
    async stop() {
      stopping = true;
      await Promise.all(workers.map((worker) => worker.close()));
    },
  };
}
