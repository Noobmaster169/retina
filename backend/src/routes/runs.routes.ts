import { type Request, type Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { CreateRunBody, RunEmailsQuery, type RunStatus, type RunSummary } from "../contracts";
import { newRunId, resumeJobId } from "../lib/ids";
import { emailRuns, emails, type Run, runs } from "../ontology/repositories";
import type { RunQueues } from "../queues/run-queues";

export interface RunsDeps {
  pool: Pool;
  runQueues: RunQueues;
}

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

  async function summaryOf(run: Run): Promise<RunSummary> {
    const [stageCounts, queues] = await Promise.all([emailRuns.stageCounts(pool, run.id), runQueues.counts()]);
    return toSummary(run, stageCounts, queues);
  }

  /** Moves the run, answers 404 or 409 when it cannot, and returns the run when it could. */
  async function transition(req: Request, res: Response, to: RunStatus, from: RunStatus[]): Promise<Run | null> {
    const id = runIdParam(req, res);
    if (!id) return null;
    if (!(await runs.setStatus(pool, id, to, from))) {
      const current = await runs.status(pool, id);
      if (!current) res.status(404).json({ error: "no such run" });
      else res.status(409).json({ error: `a ${current} run cannot become ${to}` });
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
      await runQueues.startIngest(run.id, run.id);
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
      runQueues.counts(),
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
    const run = await transition(req, res, "running", ["paused"]);
    if (!run) return;
    // A fresh job id: the paused run's first ingest job completed, and BullMQ ignores a repeat of its id.
    await runQueues.startIngest(run.id, resumeJobId(run.id, Date.now()));
    res.json(await summaryOf(run));
  });

  router.post("/:id/cancel", async (req, res) => {
    const run = await transition(req, res, "cancelled", ["created", "running", "paused"]);
    if (!run) return;
    await runQueues.removeWaiting(run.id);
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
