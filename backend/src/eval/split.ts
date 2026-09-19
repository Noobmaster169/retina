import type { TruthRow } from "../contracts";
import { prng, shuffled } from "./prng";

export interface Split {
  seed: number;
  train: string[];
  holdout: string[];
}

const HOLDOUT_SHARE = 0.2;

/**
 * Category and review reason, plus whether a defect was planted. The last
 * part matters because half the final score is the end-to-end rate over the
 * defect emails alone: left to chance, a holdout could hold 4 of them or 15.
 */
function stratumOf(row: TruthRow): string {
  return [row.category, row.review_reason ?? "none", row.has_defect ? "defect" : "clean"].join("|");
}

/** A stratified 80/20 split. Deterministic for a given truth and seed. */
export function splitIds(truth: Record<string, TruthRow>, seed: number): Split {
  const strata = new Map<string, string[]>();
  for (const emailId of Object.keys(truth).sort()) {
    const key = stratumOf(truth[emailId]);
    strata.set(key, [...(strata.get(key) ?? []), emailId]);
  }

  const random = prng(seed);
  const holdout: string[] = [];
  for (const key of [...strata.keys()].sort()) {
    const ids = strata.get(key) ?? [];
    // A stratum of one stays in train: a holdout with nothing to learn from is no use.
    const take = ids.length >= 2 ? Math.max(1, Math.round(HOLDOUT_SHARE * ids.length)) : 0;
    holdout.push(...shuffled(ids, random).slice(0, take));
  }

  const held = new Set(holdout);
  return {
    seed,
    train: Object.keys(truth)
      .filter((id) => !held.has(id))
      .sort(),
    holdout: holdout.sort(),
  };
}
