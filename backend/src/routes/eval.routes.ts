import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { RunSource } from "../contracts";

import { hasGroundTruth } from "../eval/ground-truth";
import { evaluateRun } from "../eval/report";
import { runs } from "../ontology/repositories";

/**
 * Dev only. The answer key is on a developer's disk and nowhere else, so
 * where EVAL_GROUND_TRUTH_PATH is unset (the VPS) these routes do not exist.
 */
export function evalRouter(deps: { pool: Pool }): Router {
  const router = Router();

  router.get("/runs/:id", async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const run = id.success ? await runs.get(deps.pool, id.data) : null;
    // Graded against the key of the inbox this run read, never another's.
    const inbox = RunSource.catch("averis").parse(run?.source);
    if (!run || !hasGroundTruth(inbox)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(await evaluateRun(deps.pool, run.id, inbox));
  });

  return router;
}
