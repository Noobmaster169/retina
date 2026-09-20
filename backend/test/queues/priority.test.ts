import { describe, expect, it } from "vitest";

import { DEFAULT_TIER } from "../../src/contracts";
import { computePriority } from "../../src/queues/priority";

/**
 * The formula, and the two properties the queue depends on: a tier always
 * beats the tier below it whatever the tonnage, and nothing ever lands on 0,
 * which BullMQ reads as "no priority" rather than "most urgent".
 */

describe("computePriority", () => {
  const cases: [string, { tier: number | null; tonnageMt: number | null }, number][] = [
    ["tier 1 with 500 MT is the most urgent an ordinary email gets", { tier: 1, tonnageMt: 500 }, 150],
    ["tier 5 with no tonnage is the least urgent", { tier: 5, tonnageMt: 0 }, 1000],
    ["an unranked domain is treated as tier 3", { tier: null, tonnageMt: null }, DEFAULT_TIER * 200],
    ["tonnage below 10 MT earns nothing", { tier: 3, tonnageMt: 9 }, 600],
    ["tonnage rounds down to whole points", { tier: 3, tonnageMt: 138 }, 587],
    ["the bonus stops at 99, so a huge shipment cannot cross a tier", { tier: 2, tonnageMt: 100_000 }, 301],
    ["a missing tonnage is the same as none", { tier: 2, tonnageMt: null }, 400],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(computePriority(input)).toBe(expected);
  });

  it("keeps every tier-1 email ahead of every tier-2 email, whatever the tonnage", () => {
    const worstTier1 = computePriority({ tier: 1, tonnageMt: 0 });
    const bestTier2 = computePriority({ tier: 2, tonnageMt: 1_000_000 });
    expect(worstTier1).toBeLessThan(bestTier2);
  });

  it("never returns a priority BullMQ would read as unprioritised", () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(computePriority({ tier, tonnageMt: 10_000 })).toBeGreaterThan(0);
    }
  });

  it("clamps a tier the database could not have stored", () => {
    expect(computePriority({ tier: 0, tonnageMt: null })).toBe(200);
    expect(computePriority({ tier: 9, tonnageMt: null })).toBe(1000);
    expect(computePriority({ tier: Number.NaN, tonnageMt: null })).toBe(600);
  });

  it("ignores a negative tonnage rather than turning it into a penalty", () => {
    expect(computePriority({ tier: 3, tonnageMt: -50 })).toBe(600);
  });
});
