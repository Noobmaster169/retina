import { describe, expect, it } from "vitest";

import type { GatePolicy, GateStanding } from "../../src/contracts";
import { standingOf } from "../../src/pipeline/gate";

describe("standingOf", () => {
  const cases: { name: string; policy: GatePolicy; daysSeen: number; ageDays: number; expected: GateStanding }[] = [
    { name: "a sender nothing has ever arrived from", policy: "auto", daysSeen: 0, ageDays: 0, expected: "unknown" },
    { name: "the first email of the first day", policy: "auto", daysSeen: 1, ageDays: 0, expected: "new" },
    { name: "two days seen is still new", policy: "auto", daysSeen: 2, ageDays: 20, expected: "new" },
    { name: "three days seen but only six days old is still new", policy: "auto", daysSeen: 3, ageDays: 6, expected: "new" },
    { name: "three days over seven is regular", policy: "auto", daysSeen: 3, ageDays: 7, expected: "regular" },
    { name: "nine days seen over a year is still only regular", policy: "auto", daysSeen: 9, ageDays: 365, expected: "regular" },
    { name: "ten days seen but only 29 days old is still regular", policy: "auto", daysSeen: 10, ageDays: 29, expected: "regular" },
    { name: "ten days over thirty is established", policy: "auto", daysSeen: 10, ageDays: 30, expected: "established" },
    { name: "a person said allow", policy: "allow", daysSeen: 0, ageDays: 0, expected: "trusted" },
    { name: "a person said block", policy: "block", daysSeen: 400, ageDays: 900, expected: "blocked" },
  ];

  for (const { name, policy, daysSeen, ageDays, expected } of cases) {
    it(`${name} is ${expected}`, () => {
      expect(standingOf({ policy, daysSeen, ageDays }).standing).toBe(expected);
    });
  }

  it("cannot be bought with volume: a million emails on one day is still new", () => {
    expect(standingOf({ policy: "auto", daysSeen: 1, ageDays: 0 }).standing).toBe("new");
  });

  it("a person's block beats everything a sender earned", () => {
    expect(standingOf({ policy: "block", daysSeen: 50, ageDays: 400 })).toEqual({ standing: "blocked", burst: 0, daily: 0 });
  });

  it("gives every bracket more room than the one below it", () => {
    const ladder = (["unknown", "new", "regular", "established"] as const).map((standing) => {
      const input = { unknown: [0, 0], new: [1, 1], regular: [3, 7], established: [10, 30] }[standing];
      return standingOf({ policy: "auto", daysSeen: input[0], ageDays: input[1] });
    });
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i].burst).toBeGreaterThan(ladder[i - 1].burst);
      expect(ladder[i].daily).toBeGreaterThan(ladder[i - 1].daily);
    }
  });

  it("gives an unknown sender room for one ordinary email and not two", () => {
    // Sixteen units is an email with an SI and a BL: see gate-cost.test.ts.
    const ORDINARY = 16;
    const { burst, daily } = standingOf({ policy: "auto", daysSeen: 0, ageDays: 0 });
    expect(burst).toBeGreaterThanOrEqual(ORDINARY);
    expect(burst).toBeLessThan(ORDINARY * 2);
    expect(daily).toBeGreaterThanOrEqual(ORDINARY * 3);
  });

  it("meters a whitelisted sender too, so a compromised one is not infinite", () => {
    const trusted = standingOf({ policy: "allow", daysSeen: 0, ageDays: 0 });
    expect(trusted.burst).toBeGreaterThan(0);
    expect(Number.isFinite(trusted.daily)).toBe(true);
  });

  it("reads a negative or fractional history as the floor rather than throwing", () => {
    expect(standingOf({ policy: "auto", daysSeen: -3, ageDays: -9 }).standing).toBe("unknown");
    expect(standingOf({ policy: "auto", daysSeen: 3.9, ageDays: 7.9 }).standing).toBe("regular");
  });
});
