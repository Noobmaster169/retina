import type { Category, TruthRow } from "../contracts";
import { prng, shuffled } from "./prng";
import { CATEGORIES } from "./score";

/**
 * Up to `perCategory` ids of each category, drawn with a seed from `from` and
 * never from `exclude`. Deterministic for a given truth, pool and seed. The
 * result is sorted so the file it is written to diffs cleanly.
 */
export function pickPerCategory(
  truth: Record<string, TruthRow>,
  from: string[],
  perCategory: number,
  seed: number,
  exclude: string[] = [],
): string[] {
  const skip = new Set(exclude);
  const random = prng(seed);
  const byCategory = new Map<Category, string[]>(CATEGORIES.map((category) => [category, []]));
  for (const id of [...from].sort()) {
    const row = truth[id];
    if (row && !skip.has(id)) byCategory.get(row.category)?.push(id);
  }
  return CATEGORIES.flatMap((category) => shuffled(byCategory.get(category) ?? [], random).slice(0, perCategory)).sort();
}
