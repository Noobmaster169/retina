import { config } from "../../config";
import { PromptStep, type PromptSet } from "../../contracts";
import { TerminalError } from "../../lib/errors";
import { latestVersion, loadPrompt, type Prompt } from "./registry";

/** `LLM_MODEL_<STEP>`: an experiment's model for every run, where a run names none. One entry per step, so a new step gets its own or none. */
const ENV_MODELS: Record<PromptStep, string | undefined> = {
  classify: config.LLM_MODEL_CLASSIFY,
  "classify-verify": config.LLM_MODEL_VERIFY,
  triage: config.LLM_MODEL_TRIAGE,
  "doc-type": config.LLM_MODEL_DOC_TYPE,
  extract: config.LLM_MODEL_EXTRACT,
  "extract-verify": config.LLM_MODEL_EXTRACT_VERIFY,
  "field-judge": config.LLM_MODEL_FIELD_JUDGE,
  "vision-read": config.LLM_MODEL_VISION_READ,
};

export function envModel(step: PromptStep): string | undefined {
  return ENV_MODELS[step];
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

/**
 * A run's prompt set with every step filled: what it pinned, and for a step it
 * did not pin (a run created before pinning existed) what a new run would get
 * now, the active version. Never simply the newest file: that may be an
 * experiment nobody has validated.
 */
export function completePromptSet(set: PromptSet, active: Record<string, string>, dir?: string): PromptSet {
  if (PromptStep.options.every((step) => set[step])) return set;
  return { ...pinPromptSet({}, active, dir), ...set };
}

/** The prompt a run pinned for `step`. Pass the set through `completePromptSet` first. */
export function promptFor(step: PromptStep, set: PromptSet, dir?: string): Prompt {
  const pinned = set[step];
  if (!pinned) throw new TerminalError(`the run pinned no prompt for step "${step}"`);
  return loadPrompt(step, pinned.version, pinned.model, dir);
}
