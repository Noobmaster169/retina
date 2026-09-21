import type { Category, EmailVerdict, VerifierEffect } from "@/lib/api/scoring-schemas";

/**
 * Which emails the results table shows. Pure, because every one of these
 * questions is a reading of a verdict the backend already settled: the page
 * chooses what to display and never decides what is right.
 *
 * A wrong answer is what this table is for, so the filters are named after
 * ways of being wrong rather than after columns.
 */

export type CheckName = keyof EmailVerdict["checks"];

export const CHECK_NAMES: CheckName[] = ["category", "status", "reviewReason", "defect", "defectFields", "endToEnd"];

export interface Filters {
  /** Every email, only the wrong ones, or only the clean ones. */
  outcome: "all" | "wrong" | "right";
  /** A single scored check that must be wrong, or null for any of them. */
  check: CheckName | null;
  effect: VerifierEffect | null;
  truth: Category | null;
  answer: Category | null;
  split: "all" | "train" | "holdout";
  /** Matched against the email id. */
  q: string;
}

export const NO_FILTERS: Filters = {
  outcome: "all",
  check: null,
  effect: null,
  truth: null,
  answer: null,
  split: "all",
  q: "",
};

/** The scored checks this email got wrong. A check the scorer does not score here is not one of them. */
export function wrongChecks(verdict: EmailVerdict): CheckName[] {
  return CHECK_NAMES.filter((name) => verdict.checks[name] === false);
}

export function isWrong(verdict: EmailVerdict): boolean {
  return wrongChecks(verdict).length > 0;
}

export function matches(verdict: EmailVerdict, filters: Filters): boolean {
  const wrong = isWrong(verdict);
  if (filters.outcome === "wrong" && !wrong) return false;
  if (filters.outcome === "right" && wrong) return false;
  if (filters.check !== null && verdict.checks[filters.check] !== false) return false;
  if (filters.effect !== null && verdict.classify?.effect !== filters.effect) return false;
  if (filters.truth !== null && verdict.truth.category !== filters.truth) return false;
  if (filters.answer !== null && verdict.answer.category !== filters.answer) return false;
  if (filters.split === "train" && verdict.inHoldout) return false;
  if (filters.split === "holdout" && !verdict.inHoldout) return false;
  if (filters.q && !verdict.emailId.toLowerCase().includes(filters.q.trim().toLowerCase())) return false;
  return true;
}

/** How many emails each way of being wrong accounts for, so a chip can say what it would show. */
export function checkCounts(verdicts: EmailVerdict[]): Record<CheckName, number> {
  const counts = Object.fromEntries(CHECK_NAMES.map((name) => [name, 0])) as Record<CheckName, number>;
  for (const verdict of verdicts) for (const name of wrongChecks(verdict)) counts[name] += 1;
  return counts;
}

/** How many emails each verifier effect accounts for. An unclassified email counts under none of them. */
export function effectCounts(verdicts: EmailVerdict[]): Partial<Record<VerifierEffect, number>> {
  const counts: Partial<Record<VerifierEffect, number>> = {};
  for (const verdict of verdicts) {
    const effect = verdict.classify?.effect;
    if (effect) counts[effect] = (counts[effect] ?? 0) + 1;
  }
  return counts;
}
