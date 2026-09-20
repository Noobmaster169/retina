import { Router } from "express";
import type { Pool } from "pg";

import { config } from "../config";
import type { QueueName, QueueView, RunQueuesView } from "../contracts";
import { childLogger } from "../lib/logger";
import type { LiveCall, LiveCalls } from "../live";
import { attachments, emailRuns } from "../ontology/repositories";
import { getQueues } from "../queues/queues";
import { read, viewOf, type Wording } from "../queues/queue-slots";
import { runIdParam } from "./params";
import { filesWords, stepWords } from "./step-words";

const log = childLogger({ module: "run-queues.routes" });

export interface RunQueuesDeps {
  pool: Pool;
  /** Where in-flight calls are kept. Absent, a slot says what its queue does rather than what the model is doing. */
  live?: LiveCalls;
}

const CONCURRENCY: Record<QueueName, number> = {
  classify: config.CLASSIFY_CONCURRENCY,
  compare: config.COMPARE_CONCURRENCY,
};

/** A queue that cannot be reached draws as unreachable, never as empty. Zeroes would read as a finished run. */
function unreachable(name: QueueName): QueueView {
  return { name, concurrency: CONCURRENCY[name], waiting: 0, active: 0, failed: 0, heldUntil: null, slots: [], next: [] };
}

/**
 * Who holds each slot of each queue, what they are doing, and who is next.
 * Separate from GET /runs/:id because it reads Redis on every poll, and that
 * summary must still answer when Redis is down.
 */
export function runQueuesRouter(deps: RunQueuesDeps): Router {
  const router = Router();
  const { pool } = deps;

  /** What the model is doing for each email of this run. A preview is never worth failing the page over. */
  async function stepsOf(runId: string): Promise<Wording["stepOf"]> {
    if (!deps.live) return () => undefined;
    const inFlight = await emailRuns.inFlight(pool, runId);
    let calls: LiveCall[];
    try {
      calls = await deps.live.get(inFlight.map((run) => run.id));
    } catch (error) {
      log.warn({ runId, err: error instanceof Error ? error.message : String(error) }, "live calls unavailable");
      return () => undefined;
    }
    const emailOf = new Map(inFlight.map((run) => [run.id, run.emailId]));
    const words = new Map(
      calls.flatMap((call) => {
        const emailId = emailOf.get(call.emailRunId);
        return emailId ? [[emailId, stepWords(call.step)] as const] : [];
      }),
    );
    return (emailId) => words.get(emailId);
  }

  router.get("/:id/queues", async (req, res) => {
    const runId = runIdParam(req, res);
    if (!runId) return;

    const handoff = await emailRuns.handoff(pool, runId);
    let body: RunQueuesView;
    try {
      const { classify, compare } = getQueues();
      const [stepOf, classifyRead, compareRead] = await Promise.all([
        stepsOf(runId),
        read(classify, "classify", runId),
        read(compare, "compare", runId),
      ]);
      // One query for both queues' waiting rows, which queue-slots has already
      // trimmed to the handful the page lists.
      const queued = [...classifyRead.next, ...compareRead.next].map((job) => job.emailId);
      const files = await attachments.filenamesFor(pool, runId, queued);
      const words: Wording = { stepOf, filesOf: (emailId) => filesWords(files.get(emailId) ?? []) };
      const now = Date.now();
      body = {
        classify: viewOf(classifyRead, CONCURRENCY.classify, now, words),
        compare: viewOf(compareRead, CONCURRENCY.compare, now, words),
        handoff,
        reachable: true,
      };
    } catch (error) {
      log.warn({ runId, err: error instanceof Error ? error.message : String(error) }, "queues unavailable");
      body = { classify: unreachable("classify"), compare: unreachable("compare"), handoff, reachable: false };
    }
    res.json(body);
  });

  return router;
}
