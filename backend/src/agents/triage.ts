import { z } from "zod";

import type { ClassifyInput } from "../pipeline/classify";
import { type CallIds, emailSections, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/** The sender's request, as the organisers separate the two: a draft asked for, or a comparison whose documents did not arrive. */
export const TriageOutput = z.object({
  rationale: z.string().max(600),
  request: z.enum(["send_draft", "compare_documents"]),
  confidence: z.number().min(0).max(1),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

/** For a comparison request with nothing attached: what is the sender asking for? The model reads the email; code reads nothing. */
export async function triageRequest(
  deps: StructuredDeps,
  prompt: Prompt,
  input: ClassifyInput,
  ids: CallIds,
): Promise<StructuredResult<TriageOutput>> {
  return callStructured(deps, { prompt, input: emailSections(input), schema: TriageOutput, project: WORKER_PROJECT, ...ids });
}
