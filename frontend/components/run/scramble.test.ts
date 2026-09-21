import { describe, expect, it } from "vitest";

import { framesFor, scrambleLike } from "./scramble";

/** A fixed source, so what the roll does is a fact rather than a screenshot. */
function fixed(...values: number[]): () => number {
  let at = 0;
  return () => values[at++ % values.length];
}

describe("scrambleLike", () => {
  it("rolls every digit while nothing has settled", () => {
    expect(scrambleLike("$1.13", 0, fixed(0.7, 0.2, 0.9))).toBe("$7.29");
  });

  it("holds the currency mark, the point and every other non-digit still", () => {
    const rolled = scrambleLike("RM 4.50", 0, fixed(0.1));
    expect(rolled).toMatch(/^RM \d\.\d\d$/);
    expect(rolled.length).toBe("RM 4.50".length);
  });

  it("locks from the left, so the number settles the way it is read", () => {
    expect(scrambleLike("$1.13", 3, fixed(0.5))).toBe("$1.55");
    expect(scrambleLike("$1.13", 2, fixed(0.5))).toBe("$1.55");
  });

  it("is the target once everything has settled", () => {
    expect(scrambleLike("$1.13", 5, fixed(0.5))).toBe("$1.13");
    expect(scrambleLike("$1.13", 99, fixed(0.5))).toBe("$1.13");
  });

  it("never changes the length, so the line cannot reflow mid-roll", () => {
    for (let locked = 0; locked <= 8; locked++) {
      expect(scrambleLike("$24.02", locked, fixed(0.3, 0.8)).length).toBe(6);
    }
  });

  it("leaves a number with no digits alone", () => {
    expect(scrambleLike("--", 0, fixed(0.5))).toBe("--");
  });
});

describe("framesFor", () => {
  it("gives a short number long enough to be seen", () => {
    expect(framesFor("$1.13")).toBe(8);
  });

  it("gives a long one a frame per character", () => {
    expect(framesFor("$1,234,567.89")).toBe(13);
  });
});
