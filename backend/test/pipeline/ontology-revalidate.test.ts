import { describe, expect, it } from "vitest";

import { type Nearby, planSighting, seenAmong, standing } from "../../src/pipeline/ontology";

/**
 * The question is never "what would the model say" but "was the model shown the
 * same list". A different list is asked again; the same list is not.
 */

const near = (id: number, matched: string, canonical = matched): Nearby => ({ id: String(id), matched, canonical });

describe("what a model was shown", () => {
  it("is equal for the same things whatever order the search ranked them in", () => {
    expect(seenAmong([near(4, "A"), near(9, "B")])).toBe(seenAmong([near(9, "B"), near(4, "A")]));
  });

  it("is equal when a spelling is listed as both the match and the canonical name", () => {
    expect(seenAmong([near(4, "A", "A")])).toBe(seenAmong([near(4, "A")]));
  });

  it.each([
    ["a new thing appeared", [near(4, "A")], [near(4, "A"), near(9, "B")]],
    ["a thing left", [near(4, "A"), near(9, "B")], [near(4, "A")]],
    ["a thing gained a spelling", [near(4, "A", "A")], [near(4, "A2", "A")]],
    ["nothing became something", [], [near(4, "A")]],
  ])("differs when %s", (_name, before, after) => {
    expect(seenAmong(before)).not.toBe(seenAmong(after));
  });
});

describe("whether a judgement still holds", () => {
  const ask = planSighting("vessel", "X", []);
  const same = seenAmong([near(4, "A")]);

  it("holds when the list it was made against is the list there is", () => {
    expect(standing(same, { plan: ask, nearby: same })).toEqual({ holds: true });
  });

  it("holds for a spelling nothing was near, while nothing is near it now", () => {
    expect(standing(seenAmong([]), { plan: ask, nearby: seenAmong([]) })).toEqual({ holds: true });
  });

  it("asks again when something turned up near it", () => {
    expect(standing(seenAmong([]), { plan: ask, nearby: same })).toEqual({ holds: false, use: null });
  });

  it("uses the thing that now holds this exact spelling, whatever the list says", () => {
    const now = planSighting("vessel", "X", [{ entityId: 7, kind: "vessel", value: "X" }]);
    expect(standing(same, { plan: now, nearby: same })).toEqual({ holds: false, use: 7 });
  });
});
