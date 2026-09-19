import { pinPromptSet } from "../agents";
import { config } from "../config";
import type { CreateRunBody, PromptSet } from "../contracts";
import type { Queryable } from "../db";
import { subsetIds } from "../eval/id-lists";
import { TerminalError } from "../lib/errors";
import { listModels } from "../llm";
import { promptVersions } from "../ontology/repositories";

export type RunPlan = { ok: true; emailIds?: string[]; promptSet: PromptSet } | { ok: false; error: string };

/**
 * A model named for a run, or by the env for every run, must be a proxy
 * alias. Checked here, before any email is queued, because a wrong one
 * otherwise fails every email of the run.
 */
async function unknownModels(models: string[]): Promise<string[]> {
  const named = [...new Set(models)];
  if (named.length === 0) return [];
  const known = new Set((await listModels()).map((model) => model.id));
  return named.filter((model) => !known.has(model));
}

/** What a new run will process and with which prompts, or why it cannot start. */
export async function planRun(db: Queryable, body: CreateRunBody): Promise<RunPlan> {
  // The env overrides get the same check: a typo there would fail every run, not just one.
  const named = [...Object.values(body.models ?? {}), config.LLM_MODEL_CLASSIFY, config.LLM_MODEL_VERIFY];
  const unknown = await unknownModels(named.filter((model): model is string => model !== undefined));
  if (unknown.length > 0) return { ok: false, error: `not a proxy alias: ${unknown.join(", ")}` };

  let promptSet: PromptSet;
  try {
    promptSet = pinPromptSet(body, await promptVersions.activeVersions(db));
  } catch (error) {
    if (!(error instanceof TerminalError)) throw error;
    return { ok: false, error: error.message };
  }

  const emailIds = body.emailIds ?? (body.subset ? await subsetIds(body.subset) : undefined);
  return { ok: true, emailIds, promptSet };
}
