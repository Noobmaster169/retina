import type { Category } from "../../contracts";

/**
 * Below this stated confidence the verifier checks the generator. Chosen on
 * the train split: under prompt v2, 24 of 401 train emails (6.0%) fell below
 * it, and every miss phase 2 recorded sat at 0.70 or lower. The holdout result
 * is recorded next to it in docs/PROGRESS.md.
 */
export const VERIFY_BELOW = 0.9;

export interface Opinion {
  category: Category;
  confidence: number;
}

export interface Decision {
  finalCategory: Category;
  decidedBy: "llm" | "verifier";
}

/** The only input is the model's own confidence. Nothing about the email's sender, subject or body. */
export function needsVerifier(generator: Opinion): boolean {
  return generator.confidence < VERIFY_BELOW;
}

/** When the verifier ran, it has the last word: it saw the generator's case and the case against it. */
export function decide(generator: Opinion, verifier: Opinion | null): Decision {
  if (!verifier) return { finalCategory: generator.category, decidedBy: "llm" };
  return { finalCategory: verifier.category, decidedBy: "verifier" };
}
