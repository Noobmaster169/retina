import { completePromptSet } from "../../agents";
import { type PromptSet, PromptStep } from "../../contracts";
import type { Queryable } from "../../db";
import { promptVersions, type Run } from "../../ontology/repositories";

/**
 * The run's prompt set with every step filled. A run created before a step
 * existed has no pin for it and gets the active version, looked up only for
 * such a run. Never the newest file on disk: that may be an unvalidated experiment.
 */
export async function promptSetOf(pool: Queryable, run: Run): Promise<PromptSet> {
  if (PromptStep.options.every((step) => run.promptSet[step])) return run.promptSet;
  return completePromptSet(run.promptSet, await promptVersions.activeVersions(pool));
}
