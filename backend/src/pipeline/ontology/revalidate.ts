import type { SightingPlan } from "./resolve-sighting";

/**
 * Whether a judgement made against one state of the ontology still holds
 * against a later one.
 *
 * Two readings that run at once each judge their spellings against what was
 * committed when they started, so neither sees the other's new things. Run one
 * after the other, the second would have seen them. This is the check that says
 * whether that difference could have changed an answer, so that a reading only
 * commits a judgement its serial twin would also have made.
 *
 * It compares what the model was shown and never what it would say: whether a
 * changed list changes the answer is the model's to decide, and it is asked
 * again. Pure. No database, no io.
 */

/** One thing near a spelling, as the search returned it. */
export interface Nearby {
  id: string;
  /** The stored spelling that matched. */
  matched: string;
  canonical: string;
}

/**
 * The things a model was shown for a spelling, as a string that is equal
 * exactly when the list is: the same things, each written the same ways. The
 * order the search ranked them in is left out on purpose, because a thing's
 * mention count moves its rank and the count alone changes no answer.
 */
export function seenAmong(nearby: Nearby[]): string {
  const rows = nearby.map((one) => [Number(one.id), [...new Set([one.matched, one.canonical])].sort()] as const);
  return JSON.stringify(rows.sort((a, b) => a[0] - b[0]));
}

export type Standing =
  | { holds: true }
  /** Something now holds this exact spelling, so no judgement is needed: use it. */
  | { holds: false; use: number }
  /** The list the model saw is not the list there is now. Ask again. */
  | { holds: false; use: null };

/** `then` is what the model was shown; `now` is the plan and the list against the committed state. */
export function standing(then: string, now: { plan: SightingPlan; nearby: string }): Standing {
  if (now.plan.decision === "use") return { holds: false, use: now.plan.entityId };
  return now.nearby === then ? { holds: true } : { holds: false, use: null };
}
