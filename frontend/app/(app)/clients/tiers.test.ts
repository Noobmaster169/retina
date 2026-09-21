import { describe, expect, it } from "vitest";

import { labelOf, positionOf, tierAt, TIERS } from "./tiers";

/**
 * The slider runs the opposite way to the stored number, so the one thing
 * worth pinning is that the two never drift: whatever a handle is dragged to
 * has to come back as the tier that reads the same on screen.
 */

describe("positionOf and tierAt", () => {
  const cases: { name: string; tier: number; position: number }[] = [
    { name: "served first sits at the right-hand end", tier: 1, position: 5 },
    { name: "high is one in from it", tier: 2, position: 4 },
    { name: "normal is the middle either way", tier: 3, position: 3 },
    { name: "low is one in from the left", tier: 4, position: 2 },
    { name: "served last sits at the left-hand end", tier: 5, position: 1 },
  ];

  for (const one of cases) {
    it(one.name, () => {
      expect(positionOf(one.tier)).toBe(one.position);
      expect(tierAt(one.position)).toBe(one.tier);
    });
  }

  it("round-trips every tier the api accepts", () => {
    for (const { tier } of TIERS) expect(tierAt(positionOf(tier))).toBe(tier);
  });

  it("clamps a tier no row should hold rather than sliding off the track", () => {
    expect(positionOf(0)).toBe(5);
    expect(positionOf(9)).toBe(1);
    expect(positionOf(Number.NaN)).toBe(3);
  });
});

describe("labelOf", () => {
  it("names each tier as the screen names it", () => {
    expect(TIERS.map((one) => labelOf(one.tier))).toEqual(["First", "High", "Normal", "Low", "Last"]);
  });

  it("falls back to the default's word for a number nobody set", () => {
    expect(labelOf(Number.NaN)).toBe("Normal");
  });
});
