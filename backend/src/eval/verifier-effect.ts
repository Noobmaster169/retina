import type { Category, VerifierEffect } from "../contracts";

/**
 * What the second reader did to the first one's answer, measured against the
 * truth. The question a prompt change has to answer is not how often the
 * verifier ran but whether it was worth running, and that is four different
 * things: a save, a break, a shrug, and a miss neither reader caught.
 *
 * The chain is the model's own. A human correction settles the submitted
 * category and never enters here: it says nothing about either prompt.
 */
export function verifierEffect(gen: Category, ver: Category | null, truth: Category): VerifierEffect {
  if (ver === null) return "not_run";
  const genRight = gen === truth;
  const verRight = ver === truth;
  if (!genRight && verRight) return "fixed";
  if (genRight && !verRight) return "broke";
  if (genRight) return "agreed_right";
  return ver === gen ? "agreed_wrong" : "changed_still_wrong";
}
