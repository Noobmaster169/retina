import { DelayedError, type Job, UnrecoverableError, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { z } from "zod";

import { config } from "../config";
import { type IngestDeps, replayRun } from "../ingest";
import { TerminalError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { emailRuns, runs } from "../ontology/repositories";
import { ClassifyJob, CompareJob, DEFAULT_PRIORITY, IngestJob, type JobAdder, QUEUES } from "./names";
import { processClassify } from "./processors/classify.processor";
import { processCompare } from "./processors/compare.processor";

const log = childLogger({ module: "workers" });

export interface WorkerDeps extends IngestDeps {
  compare: JobAdder<CompareJob>;
}

// LLM calls are slow, so an email job may hold its lock for a while.
const EMAIL_LOCK = { lockDuration: 120_000, stalledInterval: 30_000 };
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

function isFinalFailure(job: Job, error: Error): boolean {
  return error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
}

function onEmailJobFailed(deps: WorkerDeps, stage: string) {
  return async (job: Job | undefined, error: Error): Promise<void> => {
    const data = ClassifyJob.safeParse(job?.data);
    if (!job || !data.success) return;
    const { runId, emailId } = data.data;
    if (isFinalFailure(job, error)) {
      log.error({ runId, emailId, stage, err: error.message }, "job failed for good");
      await emailRuns.setStage(deps.pool, runId, emailId, "failed", { error: error.message, finished: true });
      return;
    }
    log.warn({ runId, emailId, stage, attempt: job.attemptsMade, err: error.message }, "job failed, will retry");
    await emailRuns.incrementAttempt(deps.pool, runId, emailId);
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
        const { runId } = parse(IngestJob, job);
        const outcome = await replayRun(deps, runId, {
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
    (job) =>
      noRetryOnTerminal(() =>
        processClassify(deps, parse(ClassifyJob, job), job.opts.priority ?? DEFAULT_PRIORITY),
      ),
    { connection, concurrency: config.CLASSIFY_CONCURRENCY, ...EMAIL_LOCK },
  );

  const compare = new Worker(
    QUEUES.compare,
    (job) => noRetryOnTerminal(() => processCompare(deps, parse(CompareJob, job))),
    { connection, concurrency: config.COMPARE_CONCURRENCY, ...EMAIL_LOCK },
  );

  ingest.on("failed", async (job, error) => {
    const data = IngestJob.safeParse(job?.data);
    if (!job || !data.success || !isFinalFailure(job, error)) return;
    log.error({ runId: data.data.runId, err: error.message }, "ingest failed for good");
    await runs.setStatus(deps.pool, data.data.runId, "failed", ["created", "running"]);
  });
  classify.on("failed", onEmailJobFailed(deps, "classify"));
  compare.on("failed", onEmailJobFailed(deps, "compare"));

  const workers = [ingest, classify, compare];
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
