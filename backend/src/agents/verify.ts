import { z } from "zod";

import { Category } from "../contracts";
import type { ClassifyInput } from "../pipeline/classify";
import { type CallIds, type ClassifyOutput, emailSections, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * The case against the proposal comes first, because a schema-bound answer has
 * no room for prose outside the object and the verdict must follow the
 * argument rather than precede it.
 */
export const VerifyOutput = z.object({
  counter_cases: z.string().max(1200),
  rationale: z.string().max(600),
  category: Category,
  agrees: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type VerifyOutput = z.infer<typeof VerifyOutput>;

/** The verifier: the same email, the generator's proposal, and the strongest case for every other category. */
export async function verifyClassification(
  deps: StructuredDeps,
  prompt: Prompt,
  input: ClassifyInput,
  proposal: ClassifyOutput,
  ids: CallIds,
): Promise<StructuredResult<VerifyOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      ...emailSections(input),
      proposal: `category: ${proposal.category}\nconfidence: ${proposal.confidence}\nreasoning: ${proposal.rationale}`,
    },
    schema: VerifyOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
