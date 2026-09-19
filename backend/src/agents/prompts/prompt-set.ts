import { config } from "../../config";
import { PromptStep, type PromptSet } from "../../contracts";
import { latestVersion, loadPrompt, type Prompt } from "./registry";

/** `LLM_MODEL_<STEP>`: an experiment's model for every run, where a run names none. */
function envModel(step: PromptStep): string | undefined {
  return step === "classify" ? config.LLM_MODEL_CLASSIFY : config.LLM_MODEL_VERIFY;
}

export interface PinRequest {
  promptSet?: Partial<Record<PromptStep, string>>;
  models?: Partial<Record<PromptStep, string>>;
}

/**
 * What every step of a new run will run, fixed now so that nothing added to
 * disk or switched active later changes a run halfway. The version is the one
 * the run asks for, else the active row, else the newest file; the model is
 * the run's, else the env's, else the file's. Loading each prompt here also
 * refuses a version that does not exist before any email is queued.
 */
export function pinPromptSet(request: PinRequest, active: Record<string, string>, dir?: string): PromptSet {
  const pinned: PromptSet = {};
  for (const step of PromptStep.options) {
    const version = request.promptSet?.[step] ?? active[step] ?? latestVersion(step, dir);
    const prompt = loadPrompt(step, version, undefined, dir);
    pinned[step] = { version, model: request.models?.[step] ?? envModel(step) ?? prompt.model };
  }
  return pinned;
}

/** The prompt a run pinned for `step`. A run from before pinning existed gets what it always got: the newest file. */
export function promptFor(step: PromptStep, set: PromptSet, dir?: string): Prompt {
  const pinned = set[step];
  if (pinned) return loadPrompt(step, pinned.version, pinned.model, dir);
  return loadPrompt(step, latestVersion(step, dir), envModel(step), dir);
}
