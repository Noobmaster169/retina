import type { TurnResult } from "../agents/chat/loop";

/**
 * The two numbers the ontology question set exists to report.
 *
 * Its own file because it is its own question: every other check in
 * chat-score.ts is a yes or a no about one turn, and this is a pair of
 * fractions over a set a person wrote out by hand.
 */

/**
 * How well the things a turn matched line up with the ones a person listed.
 *
 * Measured against what `find_entities` returned and never against the prose:
 * an answer that names a company in a sentence has not necessarily put it in
 * the set, and the set is what a later query joins on.
 */
export interface EntitySetScore {
  expected: number;
  matched: number;
  /** Of what it matched, the share that was expected. */
  precision: number;
  /** Of what was expected, the share it matched. */
  recall: number;
  missed: string[];
  extra: string[];
}

/** Every name a `find_entities` call put in its result, across the turn. */
export function matchedNames(calls: TurnResult["toolCalls"]): string[] {
  const names = calls
    .filter((call) => call.tool === "find_entities" && call.ok && call.result)
    .flatMap((call) => {
      const at = call.result?.columns.indexOf("name") ?? -1;
      return at < 0 ? [] : (call.result?.rows.map((row) => row[at]) ?? []);
    })
    .filter((name): name is string => name !== null);
  return [...new Set(names)];
}

export function scoreEntitySet(expected: string[], got: string[]): EntitySetScore {
  const has = (wanted: string) => got.some((name) => name.toLowerCase().includes(wanted.toLowerCase()));
  const wanted = (name: string) => expected.some((one) => name.toLowerCase().includes(one.toLowerCase()));
  const hit = expected.filter(has);
  const right = got.filter(wanted);
  return {
    expected: expected.length,
    matched: got.length,
    precision: got.length === 0 ? 0 : right.length / got.length,
    recall: expected.length === 0 ? 1 : hit.length / expected.length,
    missed: expected.filter((one) => !has(one)),
    extra: got.filter((name) => !wanted(name)),
  };
}
