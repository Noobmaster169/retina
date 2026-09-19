import { z } from "zod";

import { config } from "../config";
import { Category } from "../contracts";
import type { ClassifyInput } from "../pipeline/classify";
import { resolvePrompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/** The category is the organisers' enum, so the model cannot answer with one that does not exist. */
export const ClassifyOutput = z.object({
  category: Category,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(600),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutput>;

export const WORKER_PROJECT = "worker";

/** The generator: one zero-shot call that names the email's category. */
export async function classifyEmail(
  deps: StructuredDeps,
  input: ClassifyInput,
  ids: { runId: string; emailRunId: string },
): Promise<StructuredResult<ClassifyOutput>> {
  return callStructured(deps, {
    prompt: resolvePrompt("classify", config.LLM_MODEL_CLASSIFY),
    input: { from: input.from, subject: input.subject, attachments: input.attachments, body: input.body },
    schema: ClassifyOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
