import { describe, expect, it } from "vitest";

import type { FieldJudgementView } from "@/lib/api/comparison-schemas";
import type { LlmCall } from "@/lib/api/trace-schemas";

import { duration, promptsUsed, spendOf, tallyFields } from "./report-figures";

function field(over: Partial<FieldJudgementView> & { field: FieldJudgementView["field"] }): FieldJudgementView {
  return { siValue: "a", blValue: "a", same: true, missing: false, confidence: 0.99, rationale: null, ...over };
}

function call(over: Partial<LlmCall> & { id: string; step: string }): LlmCall {
  return {
    emailId: "email_043",
    model: "sonnet",
    promptVersion: "v1",
    attempt: 1,
    ok: true,
    error: null,
    parsed: null,
    latencyMs: 1000,
    createdAt: "2026-09-22T01:22:18.000Z",
    system: "",
    user: "",
    responseText: null,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.001,
    ...over,
  };
}

describe("tallyFields", () => {
  it("counts the three verdicts and never double counts a missing one", () => {
    const fields = [
      field({ field: "shipper" }),
      field({ field: "consignee" }),
      field({ field: "container_count", same: false }),
      // `same` is false on a missing field too; it must count once, as missing.
      field({ field: "gross_weight_kg", same: false, missing: true }),
    ];
    expect(tallyFields(fields)).toEqual({ total: 4, same: 2, differ: 1, missing: 1 });
  });

  it("is all zeroes for a pair that was never judged", () => {
    expect(tallyFields([])).toEqual({ total: 0, same: 0, differ: 0, missing: 0 });
  });
});

describe("spendOf", () => {
  it("adds the calls, the model time and the tokens", () => {
    const spend = spendOf([
      call({ id: "1", step: "classify", latencyMs: 3700, inputTokens: 2, outputTokens: 161, costUsd: 0.002 }),
      call({ id: "2", step: "extract", latencyMs: 13400, inputTokens: 4, outputTokens: 1737, costUsd: 0.019 }),
    ]);
    expect(spend.calls).toBe(2);
    expect(spend.seconds).toBe(17);
    expect(spend.tokens).toBe(1904);
    expect(spend.costUsd).toBeCloseTo(0.021, 5);
  });

  it("says nothing rather than zero when no call priced itself", () => {
    expect(spendOf([call({ id: "1", step: "classify", costUsd: null })]).costUsd).toBeNull();
  });

  it("counts a call that recorded no tokens as none of them", () => {
    expect(spendOf([call({ id: "1", step: "doc-type", inputTokens: null, outputTokens: null })]).tokens).toBe(0);
  });

  it("has nothing to add for an email no call was made for", () => {
    expect(spendOf([])).toEqual({ calls: 0, seconds: 0, tokens: 0, costUsd: null });
  });
});

describe("promptsUsed", () => {
  it("names each step once, in the order it first ran", () => {
    expect(
      promptsUsed([
        call({ id: "1", step: "classify", promptVersion: "v6" }),
        call({ id: "2", step: "doc-type" }),
        call({ id: "3", step: "doc-type" }),
        call({ id: "4", step: "extract" }),
      ]),
    ).toEqual([
      { step: "classify", promptVersion: "v6", model: "sonnet" },
      { step: "doc-type", promptVersion: "v1", model: "sonnet" },
      { step: "extract", promptVersion: "v1", model: "sonnet" },
    ]);
  });

  it("keeps one step twice when it ran under two prompts, which is the thing worth seeing", () => {
    expect(
      promptsUsed([call({ id: "1", step: "extract", promptVersion: "v1" }), call({ id: "2", step: "extract", promptVersion: "v2" })]),
    ).toHaveLength(2);
  });
});

describe("duration", () => {
  const cases: [number, string][] = [
    [0, "0s"],
    [8, "8s"],
    [59, "59s"],
    [60, "1m 0s"],
    [108, "1m 48s"],
  ];
  it.each(cases)("%i seconds reads as %s", (seconds, want) => {
    expect(duration(seconds)).toBe(want);
  });
});
