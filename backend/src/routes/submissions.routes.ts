import { type Request, type Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import type { SubmissionSummary } from "../contracts";
import { RetryableError } from "../lib/errors";
import { runs, type StoredSubmission, submissions } from "../ontology/repositories";
import { buildSubmission } from "../ontology/submission";
import type { Scorer } from "../scorer/scorer";
import { keys, type ObjectStore } from "../storage";

export interface SubmissionsDeps {
  pool: Pool;
  store: ObjectStore | null;
  scorer: Scorer;
}

const SubmitQuery = z.object({ force: z.enum(["true", "false"]).default("false") });

function toSummary(row: StoredSubmission): SubmissionSummary {
  const { id, finalScore, nEmails, forced, createdAt, scoreboard } = row;
  return { id, finalScore, nEmails, forced, createdAt, scoreboard };
}

/** Mounted beside the run routes: what a run sends to the organisers' scorer, and what came back. */
export function submissionsRouter(deps: SubmissionsDeps): Router {
  const router = Router();
  const { pool, store, scorer } = deps;

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

    const { payload, incomplete } = await buildSubmission(pool, runId);
    if (incomplete.length > 0 && !forced) {
      res.status(409).json({ error: `${incomplete.length} emails are not finished`, incomplete });
      return;
    }
    if (!store) throw new RetryableError("object storage is not configured");

    // Stored before it is sent: what the scorer was given stays on record even if scoring fails.
    const payloadKey = keys.submission(runId, new Date().toISOString().replace(/[:.]/g, "-"));
    await store.put(payloadKey, Buffer.from(JSON.stringify(payload)), "application/json");

    const scoreboard = await scorer.score(payload);
    const stored = await submissions.insert(pool, {
      runId,
      payloadKey,
      scoreboard,
      nEmails: Object.keys(payload).length,
      forced,
    });
    res.status(201).json({ submissionId: stored.id, finalScore: scoreboard.final_score, scoreboard });
  });

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
