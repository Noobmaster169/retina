import { type Request, type Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { CreateRunBody, RunEmailsQuery, type RunStatus, type RunSummary } from "../contracts";
import { RetryableError } from "../lib/errors";
import { newRunId, resumeJobId } from "../lib/ids";
import { childLogger } from "../lib/logger";
import { emailRuns, emails, type Run, runs } from "../ontology/repositories";
import type { RunQueues } from "../queues/run-queues";

export interface RunsDeps {
  pool: Pool;
  runQueues: RunQueues;
}

const log = childLogger({ module: "runs.routes" });

type QueueSnapshot = RunSummary["queues"];

function toSummary(run: Run, stageCounts: RunSummary["stageCounts"], queues: QueueSnapshot): RunSummary {
  return {
    id: run.id,
    status: run.status,
    ratePerSecond: run.ratePerSecond,
    totalEmails: run.totalEmails,
    stageCounts,
    queues,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

/** The run id from the path, or null after answering 400. */
function runIdParam(req: Request, res: Response): string | null {
  const id = z.uuid().safeParse(req.params.id);
  if (id.success) return id.data;
  res.status(400).json({ error: "bad run id" });
  return null;
}

export function runsRouter(deps: RunsDeps): Router {
  const router = Router();
  const { pool, runQueues } = deps;

  /** Null when the queues cannot be reached. Runs live in Postgres and stay readable without Redis. */
  async function queueSnapshot(): Promise<QueueSnapshot> {
    try {
      return await runQueues.counts();
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      log.debug({ err: error.message }, "queue counts unavailable");
      return null;
    }
  }

  async function summaryOf(run: Run): Promise<RunSummary> {
    const [stageCounts, queues] = await Promise.all([emailRuns.stageCounts(pool, run.id), queueSnapshot()]);
    return toSummary(run, stageCounts, queues);
  }

  /** Answers 404 or 409 for a move the run could not make. */
  async function refuseMove(res: Response, id: string, to: RunStatus): Promise<void> {
    const current = await runs.status(pool, id);
    if (!current) res.status(404).json({ error: "no such run" });
    else res.status(409).json({ error: `a ${current} run cannot become ${to}` });
  }

  /** Moves the run, answers 404 or 409 when it cannot, and returns the run when it could. */
  async function transition(req: Request, res: Response, to: RunStatus, from: RunStatus[]): Promise<Run | null> {
    const id = runIdParam(req, res);
    if (!id) return null;
    if (!(await runs.setStatus(pool, id, to, from))) {
      await refuseMove(res, id, to);
      return null;
    }
    return runs.get(pool, id);
  }

  router.post("/", async (req, res) => {
    const body = CreateRunBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "invalid body", issues: body.error.issues });
      return;
    }
    const run = await runs.create(pool, {
      id: newRunId(),
      source: body.data.source,
      ratePerSecond: body.data.ratePerSecond,
      emailLimit: body.data.limit,
      emailIds: body.data.emailIds,
      createdBy: req.caller,
    });
    try {
      await runQueues.startIngest(run.id, run.id, run.ingestEpoch);
    } catch (error) {
      // The row is already there. Without a job it would sit in `created` forever.
      await runs.setStatus(pool, run.id, "failed", ["created"]);
      throw error;
    }
    res.status(201).json(await summaryOf(run));
  });

  router.get("/", async (_req, res) => {
    const all = await runs.list(pool);
    const [counts, queues] = await Promise.all([
      emailRuns.stageCountsForRuns(
        pool,
        all.map((run) => run.id),
      ),
      queueSnapshot(),
    ]);
    res.json({
      runs: all.flatMap((run) => {
        const stageCounts = counts.get(run.id);
        return stageCounts ? [toSummary(run, stageCounts, queues)] : [];
      }),
    });
  });

  router.get("/:id", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const run = await runs.get(pool, id);
    if (!run) {
      res.status(404).json({ error: "no such run" });
      return;
    }
    res.json(await summaryOf(run));
  });

  // The controller checks the status before every email, so this takes effect within one tick.
  router.post("/:id/pause", async (req, res) => {
    const run = await transition(req, res, "paused", ["created", "running"]);
    if (run) res.json(await summaryOf(run));
  });

  router.post("/:id/resume", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const epoch = await runs.resume(pool, id);
    if (epoch === null) {
      await refuseMove(res, id, "running");
      return;
    }
    try {
      // A fresh job id: the paused run's last ingest job completed, and BullMQ ignores a repeat of its id.
      await runQueues.startIngest(id, resumeJobId(id, epoch), epoch);
    } catch (error) {
      // Without a job the run would sit in `running` forever, and a running run cannot be resumed.
      await runs.setStatus(pool, id, "paused", ["running"]);
      throw error;
    }
    const run = await runs.get(pool, id);
    if (run) res.json(await summaryOf(run));
  });

  router.post("/:id/cancel", async (req, res) => {
    const run = await transition(req, res, "cancelled", ["created", "running", "paused"]);
    if (!run) return;
    try {
      await runQueues.removeWaiting(run.id);
    } catch (error) {
      // The cancel is committed and must not read as failed. Jobs left behind stop at the processors' status check.
      if (!(error instanceof RetryableError)) throw error;
      log.warn({ runId: run.id, err: error.message }, "could not remove the cancelled run's waiting jobs");
    }
    res.json(await summaryOf(run));
  });

  router.get("/:id/emails", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const query = RunEmailsQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "invalid query", issues: query.error.issues });
      return;
    }
    const { stage, q, page, pageSize } = query.data;
    const found = await emails.listForRun(pool, id, { stage, q }, { page, pageSize });
    res.json({ ...found, page, pageSize });
  });

  return router;
}
