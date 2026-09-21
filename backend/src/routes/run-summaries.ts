import type { Pool } from "pg";

import type { RunSummary } from "../contracts";
import { RetryableError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { classifications, comparisons, emailRuns, gateDecisions, llmCalls, reviewCases, type Run, submissions } from "../ontology/repositories";
import type { RunQueues } from "../queues/run-queues";
import { type QueueSnapshot, toSummary } from "./run-summary";

/**
 * A run as the API reports it, from one round of reads.
 *
 * Here rather than inside the runs router because two routes answer with it
 * now: that router, and the event stream a live page holds open instead of
 * polling. `run-summary.ts` next door is the pure part, which takes the rows
 * and lays them out; this is the gathering.
 */

const log = childLogger({ module: "run-summaries" });

/** Null when the queues cannot be reached. Runs live in Postgres and stay readable without Redis. */
export async function queueSnapshot(runQueues: RunQueues): Promise<QueueSnapshot> {
  try {
    return await runQueues.counts();
  } catch (error) {
    if (!(error instanceof RetryableError)) throw error;
    log.debug({ err: error.message }, "queue counts unavailable");
    return null;
  }
}

/** Every run's summary from one round of reads. The repositories answer for every id asked for. */
export async function summariesOf(pool: Pool, runQueues: RunQueues, all: Run[]): Promise<RunSummary[]> {
  const ids = all.map((run) => run.id);
  const [stageCounts, queues, usage, verifierShare, review, outcomes, latest, lastFinished, heldByGate] = await Promise.all([
    emailRuns.stageCountsForRuns(pool, ids),
    queueSnapshot(runQueues),
    llmCalls.usageForRuns(pool, ids),
    classifications.verifierShareForRuns(pool, ids),
    reviewCases.openCountsForRuns(pool, ids),
    comparisons.outcomesForRuns(pool, ids),
    submissions.latestForRuns(pool, ids),
    emailRuns.lastFinishedForRuns(pool, ids),
    gateDecisions.heldByRun(pool, ids),
  ]);
  const now = Date.now();
  return all.map((run) =>
    toSummary(run, {
      stageCounts: stageCounts(run.id),
      queues,
      llm: { ...usage(run.id), verifierShare: verifierShare(run.id) },
      review: review(run.id),
      outcomes: outcomes(run.id),
      lastSubmission: latest.get(run.id),
      lastFinishedAt: lastFinished(run.id),
      heldByGate: heldByGate(run.id),
      now,
    }),
  );
}

export async function summaryOf(pool: Pool, runQueues: RunQueues, run: Run): Promise<RunSummary> {
  return (await summariesOf(pool, runQueues, [run]))[0];
}
