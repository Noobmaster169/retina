import type { EntitySetScore } from "./chat-score.entities";
import type { Scored } from "./chat-score";

/**
 * A whole run of a question set in one paragraph.
 *
 * Its own file because it answers a different question from the checks: those
 * say whether one turn did what was asked, this says what a set of them is
 * worth reading as.
 */

export interface Summary {
  questions: number;
  passed: number;
  /** Turns that ran at least one recipe, none of their own SQL, and finished, as a share of the turns that queried at all. */
  recipeOnlyShare: number;
  /** Turns answered with no query, from the orientation. Not counted for or against the recipes. */
  noQuery: number;
  medianSteps: number;
  guardRefusals: number;
  adhoc: string[];
  /** Over the questions that named an expected entity set. Null where none did. */
  entitySets: { questions: number; meanPrecision: number; meanRecall: number; truthfulCompleteness: number } | null;
}

export function summarise(scored: Scored[]): Summary {
  const steps = scored.map((item) => item.steps).sort((a, b) => a - b);
  const middle = Math.floor(steps.length / 2);
  // A turn that ran nothing says nothing about whether a recipe covered the question.
  const queried = scored.filter((item) => item.recipes.length > 0 || item.adhoc || item.exhausted);
  return {
    questions: scored.length,
    passed: scored.filter((item) => item.passed).length,
    recipeOnlyShare: queried.length === 0 ? 0 : queried.filter((item) => item.recipes.length > 0 && !item.adhoc && !item.exhausted).length / queried.length,
    noQuery: scored.length - queried.length,
    medianSteps: steps.length === 0 ? 0 : steps.length % 2 === 1 ? steps[middle] : (steps[middle - 1] + steps[middle]) / 2,
    guardRefusals: scored.reduce((sum, item) => sum + item.guardRefusals, 0),
    adhoc: scored.filter((item) => item.adhoc).map((item) => item.id),
    entitySets: entitySetSummary(scored),
  };
}

/** The two numbers the ontology set exists to report, plus how often the completeness flag told the truth. */
function entitySetSummary(scored: Scored[]): Summary["entitySets"] {
  const withSets = scored.filter((item) => item.entitySet !== null);
  if (withSets.length === 0) return null;
  const mean = (of: (score: EntitySetScore) => number) =>
    withSets.reduce((sum, item) => sum + of(item.entitySet as EntitySetScore), 0) / withSets.length;
  const truthful = scored.filter((item) => item.checks.every((check) => check.name !== "completeness_is_truthful" || check.ok));
  return {
    questions: withSets.length,
    meanPrecision: mean((score) => score.precision),
    meanRecall: mean((score) => score.recall),
    truthfulCompleteness: truthful.length / scored.length,
  };
}
