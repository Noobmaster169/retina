import { Router } from "express";
import type { Pool } from "pg";

import { loadPrompt, listVersions } from "../agents/prompts/registry";
import { type PromptCatalog, PromptStep } from "../contracts";
import { promptVersions } from "../ontology/repositories";

/**
 * The prompt versions a new run may pin, per step: every file on disk, which one
 * is active, the model each file names, and any note recorded about it. The
 * runs page offers exactly these, so a choice it offers is one POST /runs accepts.
 */
export function promptsRouter(deps: { pool: Pool }): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const recorded = await promptVersions.list(deps.pool);
    const row = (step: string, version: string) => recorded.find((r) => r.step === step && r.version === version);
    const body: PromptCatalog = {
      steps: PromptStep.options.map((step) => ({
        step,
        versions: listVersions(step).map((version) => ({
          version,
          model: loadPrompt(step, version).model,
          active: row(step, version)?.active ?? false,
          notes: row(step, version)?.notes ?? null,
        })),
      })),
    };
    res.json(body);
  });

  return router;
}
