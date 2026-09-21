import { describe, expect, it } from "vitest";

import { coveringCount, nextCount, openingCount } from "./soft-page";

describe("openingCount", () => {
  const cases: { name: string; step: number; total: number; want: number }[] = [
    { name: "a list shorter than a step opens whole", step: 24, total: 9, want: 9 },
    { name: "a long list opens at one step", step: 24, total: 300, want: 24 },
    { name: "a small remainder opens whole rather than making a person scroll for two", step: 24, total: 26, want: 26 },
    { name: "the remainder that is worth a scroll does not", step: 24, total: 40, want: 24 },
    { name: "exactly a step opens whole", step: 24, total: 24, want: 24 },
    { name: "an empty list opens empty", step: 24, total: 0, want: 0 },
    { name: "no step means no paging", step: 0, total: 300, want: 300 },
  ];

  for (const one of cases) {
    it(one.name, () => expect(openingCount(one.step, one.total)).toBe(one.want));
  }
});

describe("nextCount", () => {
  const cases: { name: string; current: number; step: number; total: number; want: number }[] = [
    { name: "a scroll adds a step", current: 24, step: 24, total: 300, want: 48 },
    { name: "the last scroll stops at the end", current: 290, step: 24, total: 300, want: 300 },
    { name: "at the end it stays at the end", current: 300, step: 24, total: 300, want: 300 },
    { name: "no step means no paging", current: 24, step: 0, total: 300, want: 300 },
  ];

  for (const one of cases) {
    it(one.name, () => expect(nextCount(one.current, one.step, one.total)).toBe(one.want));
  }
});

describe("coveringCount", () => {
  const cases: { name: string; count: number; at: number; step: number; total: number; want: number }[] = [
    { name: "a row already drawn changes nothing", count: 24, at: 3, step: 24, total: 300, want: 24 },
    { name: "a row below the fold pulls the count down to it", count: 24, at: 99, step: 24, total: 300, want: 112 },
    { name: "and never past the end", count: 24, at: 99, step: 24, total: 104, want: 104 },
    { name: "nothing to cover leaves the count alone", count: 24, at: -1, step: 24, total: 300, want: 24 },
  ];

  for (const one of cases) {
    it(one.name, () => expect(coveringCount(one.count, one.at, one.step, one.total)).toBe(one.want));
  }
});
