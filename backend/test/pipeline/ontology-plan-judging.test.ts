import { describe, expect, it } from "vitest";

import { batches, planJudging } from "../../src/pipeline/ontology";

/**
 * The cost model of the whole semantic layer is this function. A question
 * asked twice is a lookup; a profile rewritten since makes exactly the things
 * it describes worth judging again; over the budget, the plan says what it
 * left rather than pretending it finished.
 */

const at = (entityId: number, profileVersion = 1) => ({ entityId, profileVersion });

describe("planning a concept's judging", () => {
  it("judges everything the first time it is asked", () => {
    expect(planJudging([at(1), at(2), at(3)], [], 10)).toEqual({ reuse: [], judgeNow: [1, 2, 3], deferred: [] });
  });

  it("makes no call at all the second time, when no profile has moved", () => {
    const plan = planJudging([at(1), at(2)], [at(1), at(2)], 10);
    expect(plan).toEqual({ reuse: [1, 2], judgeNow: [], deferred: [] });
  });

  it("re-judges exactly the thing whose profile was rewritten", () => {
    const plan = planJudging([at(1, 2), at(2, 1), at(3, 1)], [at(1, 1), at(2, 1), at(3, 1)], 10);
    expect(plan.judgeNow).toEqual([1]);
    expect(plan.reuse).toEqual([2, 3]);
  });

  it("judges again where a verdict is somehow ahead of the profile, rather than trusting it", () => {
    expect(planJudging([at(1, 1)], [at(1, 4)], 10).judgeNow).toEqual([1]);
  });

  it("stops at the budget and defers the rest, keeping the rank order", () => {
    const plan = planJudging([at(5), at(4), at(3), at(2), at(1)], [], 2);
    expect(plan.judgeNow).toEqual([5, 4]);
    expect(plan.deferred).toEqual([3, 2, 1]);
  });

  it("spends the budget on things that need judging, never on ones it already knows", () => {
    const plan = planJudging([at(1), at(2), at(3), at(4)], [at(1), at(2)], 2);
    expect(plan.reuse).toEqual([1, 2]);
    expect(plan.judgeNow).toEqual([3, 4]);
    expect(plan.deferred).toEqual([]);
  });

  it("plans nothing for no candidates", () => {
    expect(planJudging([], [at(1)], 400)).toEqual({ reuse: [], judgeNow: [], deferred: [] });
  });
});

describe("batching what is judged now", () => {
  it("cuts into whole batches and one short one, in order", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([1, 2], 5)).toEqual([[1, 2]]);
    expect(batches([], 5)).toEqual([]);
  });
});
