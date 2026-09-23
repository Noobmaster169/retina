import { envModel, pinPromptSet } from "../agents";
import { type CreateRunBody, type PromptSet, PromptStep } from "../contracts";
import type { Queryable } from "../db";
import { subsetIds } from "../eval/id-lists";
import { inboxUrl } from "../inboxes";
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
  // Refused here, before anything is stored, rather than by the worker after:
  // a run created against an inbox nobody configured would sit at "created"
  // and fail its ingest on the first tick.
  if (!inboxUrl(body.source)) return { ok: false, error: `this deployment serves no ${body.source} inbox` };
  // The split under eval/ was made from the organisers' answer key and names
  // their ids. Against another inbox it would ask for emails that are not there.
  if (body.subset && body.source !== "averis") {
    return { ok: false, error: "the dev and holdout subsets name the organisers' inbox and no other" };
  }

  // The env overrides get the same check: a typo there would fail every run, not just one.
  const named = [...Object.values(body.models ?? {}), ...PromptStep.options.map(envModel)];
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
