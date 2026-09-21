import { describe, expect, it } from "vitest";

import { cents, money, planCost, REFERENCE_USD } from "./plan-cost";

/**
 * The reference run is the one the percentages were measured on, so it is the
 * one case that has to come out at the number the measurement gave.
 */

const REFERENCE_TOKENS = 3_736 + 1_482_174;

describe("the run the share was measured on", () => {
  const cost = planCost(REFERENCE_TOKENS, 24.02, 520);

  it("works out to the dollar the formula gives", () => {
    // 0.15 x 0.15 x (200 / 4)
    expect(REFERENCE_USD).toBeCloseTo(1.125, 6);
    expect(cost.planUsd).toBeCloseTo(1.125, 6);
  });

  it("is about four and a half ringgit", () => {
    expect(cost.planMyr).toBeCloseTo(4.5, 6);
  });

  it("comes to a fifth of a cent an email, which is the claim worth checking", () => {
    expect(cost.perEmailCents).toBeCloseTo(0.216, 3);
  });

  it("is about twenty times what the API would have charged", () => {
    expect(cost.timesCheaper).toBeCloseTo(21.35, 1);
  });
});

describe("every other run is priced at what that one implies", () => {
  it("halves with half the tokens, because the plan does not care what the tokens were for", () => {
    expect(planCost(REFERENCE_TOKENS / 2, 12.01, 260).planUsd).toBeCloseTo(REFERENCE_USD / 2, 6);
  });

  it("costs nothing before anything has run", () => {
    const nothing = planCost(0, 0, 0);
    expect(nothing.planUsd).toBe(0);
    expect(nothing.perEmailCents).toBe(0);
    expect(nothing.timesCheaper).toBeNull();
  });

  it("never reports a negative share for a count that cannot be one", () => {
    expect(planCost(-5, 0, 10).planUsd).toBe(0);
  });

  it("says nothing about how much cheaper when the API price is not known", () => {
    expect(planCost(REFERENCE_TOKENS, 0, 520).timesCheaper).toBeNull();
  });
});

describe("the formatting a fraction of a cent needs", () => {
  const cases: { name: string; usd: number; want: string }[] = [
    { name: "a normal amount is two places", usd: 1.125, want: "$1.13" },
    { name: "zero is two places, not three", usd: 0, want: "$0.00" },
    { name: "under a cent gets a third place rather than reading as free", usd: 0.004, want: "$0.004" },
  ];
  for (const one of cases) {
    it(one.name, () => expect(money(one.usd)).toBe(one.want));
  }

  it("keeps a fraction of a cent legible", () => {
    expect(cents(0.216)).toBe("0.22c");
    expect(cents(4.5)).toBe("4.5c");
  });
});
