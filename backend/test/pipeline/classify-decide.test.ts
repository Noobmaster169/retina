import { describe, expect, it } from "vitest";

import { decide, needsVerifier, type Opinion, VERIFY_BELOW } from "../../src/pipeline/classify";

const opinion = (category: Opinion["category"], confidence: number): Opinion => ({ category, confidence });

describe("needsVerifier", () => {
  it.each([
    [0.0, true],
    [0.55, true],
    [VERIFY_BELOW - 0.01, true],
    [VERIFY_BELOW, false],
    [0.95, false],
    [1.0, false],
  ])("a generator at %f confidence: verify is %s", (confidence, expected) => {
    expect(needsVerifier(opinion("SI_REQUEST", confidence))).toBe(expected);
  });

  it("depends on nothing but the confidence", () => {
    for (const category of ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"] as const) {
      expect(needsVerifier(opinion(category, 0.5))).toBe(true);
      expect(needsVerifier(opinion(category, 0.99))).toBe(false);
    }
  });
});

describe("decide", () => {
  it.each([
    ["no verifier: the generator stands", opinion("SPAM", 0.97), null, "SPAM", "llm"],
    ["the verifier agrees", opinion("SI_REQUEST", 0.7), opinion("SI_REQUEST", 0.9), "SI_REQUEST", "verifier"],
    ["the verifier overrules", opinion("SI_REQUEST", 0.62), opinion("BL_COMPARISON", 0.8), "BL_COMPARISON", "verifier"],
    ["the verifier overrules even when less sure", opinion("GENERAL", 0.6), opinion("INVOICE_QUERY", 0.5), "INVOICE_QUERY", "verifier"],
  ] as const)("%s", (_name, generator, verifier, finalCategory, decidedBy) => {
    expect(decide(generator, verifier)).toEqual({ finalCategory, decidedBy });
  });
});
