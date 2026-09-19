import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

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
    if (!hasGroundTruth() || !id.success || (await runs.status(deps.pool, id.data)) === null) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(await evaluateRun(deps.pool, id.data));
  });

  return router;
}
