import { describe, expect, it } from "vitest";

import { clampDaily, median } from "../../src/pipeline/gate";

/** Fourteen days that all look the same. */
function flat(units: number): number[] {
  return Array.from({ length: 14 }, () => units);
}

describe("median", () => {
  const cases: { name: string; values: number[]; expected: number }[] = [
    { name: "nothing", values: [], expected: 0 },
    { name: "one value", values: [7], expected: 7 },
    { name: "an odd count takes the middle", values: [9, 1, 5], expected: 5 },
    { name: "an even count averages the two middles", values: [1, 2, 3, 4], expected: 2.5 },
    { name: "it does not care what order they arrived in", values: [4, 1, 3, 2], expected: 2.5 },
    { name: "one loud day does not move it", values: [...flat(13).slice(0, 13), 100_000], expected: 13 },
  ];

  for (const { name, values, expected } of cases) {
    it(name, () => expect(median(values)).toBe(expected));
  }
});

describe("clampDaily", () => {
  it("leaves a new sender alone: there is no fortnight worth having", () => {
    expect(clampDaily({ standing: "new", standingDaily: 300, recentDailyUnits: [] })).toBe(300);
  });

  it("leaves a whitelisted sender alone: a person decided and arithmetic does not argue", () => {
    expect(clampDaily({ standing: "trusted", standingDaily: 20_000, recentDailyUnits: flat(0) })).toBe(20_000);
  });

  it("lets an established sender roughly triple a normal day", () => {
    expect(clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: flat(400) })).toBe(1200);
  });

  it("never takes an earned sender below a newcomer's allowance", () => {
    expect(clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: flat(0) })).toBe(300);
    expect(clampDaily({ standing: "regular", standingDaily: 1200, recentDailyUnits: flat(10) })).toBe(300);
  });

  it("never gives more than the bracket allows however busy the fortnight was", () => {
    expect(clampDaily({ standing: "regular", standingDaily: 1200, recentDailyUnits: flat(5000) })).toBe(1200);
  });

  it("pads a short history with the zero days that really happened", () => {
    // Four days at 400 and ten days of silence: the median is 0, so the floor applies.
    expect(clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: [400, 400, 400, 400] })).toBe(300);
  });

  it("reads only the last fourteen days when handed more", () => {
    const long = [...flat(9000).slice(0, 30), ...flat(100)];
    expect(clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: long })).toBe(300);
  });

  it("is a ladder: yesterday's tripling becomes the baseline today's is measured against", () => {
    const step1 = clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: flat(200) });
    const step2 = clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: flat(step1) });
    expect(step1).toBe(600);
    expect(step2).toBe(1800);
    expect(step2).toBeGreaterThan(step1);
  });

  it("does not let one spike raise the ceiling, because the median ignores it", () => {
    const quiet = [...flat(13).slice(0, 13), 50_000];
    expect(clampDaily({ standing: "established", standingDaily: 6000, recentDailyUnits: quiet })).toBe(300);
  });

  it("returns a whole number of units", () => {
    const clamped = clampDaily({ standing: "regular", standingDaily: 1200, recentDailyUnits: [...flat(7).slice(0, 7), ...flat(500).slice(0, 7)] });
    expect(Number.isInteger(clamped)).toBe(true);
  });
});
