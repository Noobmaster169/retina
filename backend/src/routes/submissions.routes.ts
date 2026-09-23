import { type Request, type Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { RunSource, type SubmissionSummary, type SubmitRefused, type SubmitResult } from "../contracts";
import { RetryableError, TerminalError } from "../lib/errors";
import { runs, type StoredSubmission, submissions } from "../ontology/repositories";
import { buildSubmission } from "../ontology/submission";
import type { Scorer } from "../scorer/scorer";
import { keys, type ObjectStore } from "../storage";

export interface SubmissionsDeps {
  pool: Pool;
  store: ObjectStore | null;
  scorer: Scorer;
  /** The scorer for the inbox a run read. See AppDeps.scorerFor. */
  scorerFor?(source: RunSource): Scorer | null;
}

const SubmitQuery = z.object({ force: z.enum(["true", "false"]).default("false") });

function toSummary(row: StoredSubmission): SubmissionSummary {
  const { id, finalScore, nEmails, forced, createdAt, scoreboard } = row;
  return { id, finalScore, nEmails, forced, createdAt, scoreboard };
}

/** Mounted beside the run routes: what a run sends to the organisers' scorer, and what came back. */
export function submissionsRouter(deps: SubmissionsDeps): Router {
  const router = Router();
  const { pool, store } = deps;

  /**
   * The scorer holding the answer key of the dataset this run read. A run of
   * the synthetic inbox scored against the organisers' key would produce a
   * confident number about emails that key has never heard of.
   */
  function scorerOf(source: string): Scorer {
    if (!deps.scorerFor) return deps.scorer;
    const parsed = RunSource.safeParse(source);
    const scorer = parsed.success ? deps.scorerFor(parsed.data) : null;
    if (!scorer) throw new TerminalError(`this deployment has no scorer for the ${source} inbox`);
    return scorer;
  }
  // The api is one process, so this is enough to stop two tabs, or a retried
  // request, from scoring the same run twice at once.
  const submitting = new Set<string>();

  /** The run id from the path once the run is known to exist, else null after answering 400 or 404. */
  async function knownRun(req: Request, res: Response): Promise<string | null> {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad run id" });
      return null;
    }
    if ((await runs.status(pool, id.data)) === null) {
      res.status(404).json({ error: "no such run" });
      return null;
    }
    return id.data;
  }

  router.post("/:id/submit", async (req, res) => {
    const runId = await knownRun(req, res);
    if (!runId) return;
    const query = SubmitQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "force must be true or false" });
      return;
    }
    const forced = query.data.force === "true";

    if (submitting.has(runId)) {
      const busy: SubmitRefused = { error: "a submission for this run is already being scored", incomplete: [], forcible: false };
      res.status(409).json(busy);
      return;
    }
    submitting.add(runId);
    try {
      await submit(runId, forced, res);
    } finally {
      submitting.delete(runId);
    }
  });

  async function submit(runId: string, forced: boolean, res: Response): Promise<void> {
    const run = await runs.get(pool, runId);
    const { payload, incomplete } = await buildSubmission(pool, runId);
    const nEmails = Object.keys(payload).length;
    // `incomplete` only knows the emails the run holds. One that is paused or still
    // ingesting holds a finished few, and the scorer would count the rest as GENERAL.
    const notIngested = run?.status === "completed" ? Math.max(0, (run.totalEmails ?? 0) - nEmails) : null;
    if (!forced && (incomplete.length > 0 || notIngested !== 0)) {
      const error =
        notIngested === 0
          ? `${incomplete.length} emails are not finished`
          : `the run has not finished ingesting (status ${run?.status}, ${nEmails} of ${run?.totalEmails ?? "?"} emails)`;
      const refused: SubmitRefused = { error, incomplete, forcible: true };
      res.status(409).json(refused);
      return;
    }
    if (!store) throw new RetryableError("object storage is not configured");

    // Stored and recorded before it is sent: what the scorer was given stays on record even if scoring fails.
    const payloadKey = keys.submission(runId, new Date().toISOString().replace(/[:.]/g, "-"));
    await store.put(payloadKey, Buffer.from(JSON.stringify(payload)), "application/json");
    const stored = await submissions.insert(pool, { runId, payloadKey, nEmails, forced });

    const scoreboard = await scorerOf(run?.source ?? "averis").score(payload);
    await submissions.recordScore(pool, stored.id, scoreboard);
    const result: SubmitResult = { submissionId: stored.id, finalScore: scoreboard.final_score, scoreboard };
    res.status(201).json(result);
  }

  router.get("/:id/submission.json", async (req, res) => {
    const runId = await knownRun(req, res);
    if (!runId) return;
    res.json((await buildSubmission(pool, runId)).payload);
  });

  router.get("/:id/submissions", async (req, res) => {
    const runId = await knownRun(req, res);
    if (!runId) return;
    res.json({ submissions: (await submissions.listForRun(pool, runId)).map(toSummary) });
  });

  return router;
}
