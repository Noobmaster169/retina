import { type Request, type Response, Router } from "express";
import type { Pool } from "pg";

import { config } from "../config";
import { CreateRunBody, RenameRunBody, type RunList, type RunStatus, type RunSummary } from "../contracts";
import { RetryableError } from "../lib/errors";
import { newRunId, resumeJobId } from "../lib/ids";
import { childLogger } from "../lib/logger";
import { classifications, comparisons, emailRuns, gateDecisions, llmCalls, reviewCases, type Run, runs, submissions } from "../ontology/repositories";
import type { RunQueues } from "../queues/run-queues";
import { runIdParam } from "./params";
import { planRun } from "./run-plan";
import { type QueueSnapshot, toSummary } from "./run-summary";

export interface RunsDeps {
  pool: Pool;
  runQueues: RunQueues;
}

const log = childLogger({ module: "runs.routes" });

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

  /** Every run's summary from one round of reads. The repositories answer for every id asked for. */
  async function summariesOf(all: Run[]): Promise<RunSummary[]> {
    const ids = all.map((run) => run.id);
    const [stageCounts, queues, usage, verifierShare, review, outcomes, latest, lastFinished, heldByGate] = await Promise.all([
      emailRuns.stageCountsForRuns(pool, ids),
      queueSnapshot(),
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

  async function summaryOf(run: Run): Promise<RunSummary> {
    return (await summariesOf([run]))[0];
  }

  /** Answers 404 or 409 for a move the run could not make. */
  async function refuseMove(res: Response, id: string, to: RunStatus): Promise<void> {
    const current = await runs.status(pool, id);
    if (!current) res.status(404).json({ error: "no such run" });
    else res.status(409).json({ error: `a ${current} run cannot become ${to}` });
  }

  /**
   * Moves the run, answers 404 or 409 when it cannot, and returns the run when
   * it could.
   *
   * A run whose emails have all settled is refused whatever its status says.
   * `completed` is in the `from` lists only because it is the ingest's word
   * and not the pipeline's: a run reads completed the moment its last email is
   * enqueued, with both queues still full, and that run is still stoppable.
   */
  async function transition(req: Request, res: Response, to: RunStatus, from: RunStatus[]): Promise<Run | null> {
    const id = runIdParam(req, res);
    if (!id) return null;
    const before = await runs.get(pool, id);
    if (before?.status === "completed" && (await summaryOf(before)).processingDone) {
      res.status(409).json({ error: `a finished run cannot become ${to}` });
      return null;
    }
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
    const plan = await planRun(pool, body.data);
    if (!plan.ok) {
      res.status(400).json({ error: plan.error });
      return;
    }
    const run = await runs.create(pool, {
      id: newRunId(),
      source: body.data.source,
      ratePerSecond: body.data.ratePerSecond,
      emailLimit: body.data.limit,
      emailIds: plan.emailIds,
      promptSet: plan.promptSet,
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
    const body: RunList = {
      runs: await summariesOf(await runs.list(pool)),
      concurrency: { classify: config.CLASSIFY_CONCURRENCY, llm: config.LLM_MAX_CONCURRENCY },
    };
    res.json(body);
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

  /**
   * What a person calls this run. Renaming is the one thing about a run that
   * is nobody's but theirs, so it is allowed in any status, including a
   * finished one: a name is how a run is found again a week later.
   */
  router.post("/:id/rename", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const body = RenameRunBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "invalid body", issues: body.error.issues });
      return;
    }
    const run = await runs.rename(pool, id, body.data.name);
    if (!run) {
      res.status(404).json({ error: "no such run" });
      return;
    }
    res.json(await summaryOf(run));
  });

  /**
   * The ingest loop checks the status before every email and the two queues
   * check it before every job, so this takes effect within one email and one
   * job. What was already enqueued waits in `delayed` rather than being
   * dropped: see queues/pause-gate.ts.
   */
  router.post("/:id/pause", async (req, res) => {
    const run = await transition(req, res, "paused", ["created", "running", "completed"]);
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
    try {
      await runQueues.promoteDelayed(id);
    } catch (error) {
      // The run is resumed either way. Its deferred jobs wake on their own recheck instead.
      if (!(error instanceof RetryableError)) throw error;
      log.warn({ runId: id, err: error.message }, "could not wake the resumed run's deferred jobs");
    }
    const run = await runs.get(pool, id);
    if (run) res.json(await summaryOf(run));
  });

  /**
   * Drops a run and everything it produced. A running run is refused rather
   * than stopped from under its workers: cancel it first, which the run page
   * offers beside this.
   */
  router.delete("/:id", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const run = await runs.get(pool, id);
    if (!run) {
      res.status(404).json({ error: "no such run" });
      return;
    }
    if (run.status === "running") {
      res.status(409).json({ error: "this run is still running. Cancel it first, then delete it." });
      return;
    }
    try {
      await runQueues.removeWaiting(id);
    } catch (error) {
      // The jobs left behind stop at the processors' own check for the run.
      if (!(error instanceof RetryableError)) throw error;
      log.warn({ runId: id, err: error.message }, "could not remove the deleted run's waiting jobs");
    }
    if (!(await runs.remove(pool, id))) {
      res.status(409).json({ error: "the run started again while it was being deleted" });
      return;
    }
    log.info({ runId: id }, "run deleted");
    res.status(204).end();
  });

  router.post("/:id/cancel", async (req, res) => {
    const run = await transition(req, res, "cancelled", ["created", "running", "paused", "completed"]);
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

  return router;
}
