import type { EntityKind } from "../../contracts";

/**
 * Whether a spelling needs a judge, or a judge has already answered for it.
 *
 * The field judge only ever compared two values it saw side by side on a pair
 * of documents. It never saw the port written into a subject line, or the
 * consignee named in the prose of a request with no attachment at all. Those
 * are what `entity-resolve` judges, and this decides which of them are worth a
 * call.
 *
 * A spelling that is already a name of exactly one thing is not a rule and not
 * a normaliser: it is a judgement some model already made, stored, and reused.
 * A mailbox repeats its names, so in steady state almost nothing here costs a
 * call. What this never does is decide a match itself: two candidates, or none,
 * both go to the model.
 *
 * Pure. No database, no io.
 */

/** One stored spelling, as the lookup returned it. */
export interface NameHit {
  entityId: number;
  kind: EntityKind;
  value: string;
}

export type SightingPlan =
  | { decision: "use"; entityId: number; how: "exact" | "same case" }
  | { decision: "ask" };

function distinct(hits: NameHit[]): number[] {
  return [...new Set(hits.map((hit) => hit.entityId))];
}

export function planSighting(kind: EntityKind, surface: string, hits: NameHit[]): SightingPlan {
  const ofKind = hits.filter((hit) => hit.kind === kind);

  const exact = distinct(ofKind.filter((hit) => hit.value === surface));
  if (exact.length === 1) return { decision: "use", entityId: exact[0], how: "exact" };

  // Case alone is not a difference of fact, and every stored spelling here was
  // accepted by a judge under some case. Two things holding the same spelling
  // in different cases is a real ambiguity and goes to the model.
  const cased = distinct(ofKind.filter((hit) => hit.value.toLowerCase() === surface.toLowerCase()));
  if (cased.length === 1) return { decision: "use", entityId: cased[0], how: "same case" };

  return { decision: "ask" };
}
