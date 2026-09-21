import { describe, expect, it } from "vitest";

import type { TruthRow } from "../../src/contracts";
import { compareEmail } from "../../src/eval/compare";

const truth = (over: Partial<TruthRow> = {}): TruthRow => ({
  category: "BL_COMPARISON",
  status: "OK",
  review_reason: null,
  has_defect: false,
  defect_fields: [],
  ...over,
});
const answer = (over: Partial<TruthRow> = {}) => ({ ...truth(), ...over });

describe("compareEmail", () => {
  it.each([
    [
      "a clean comparison answered right",
      truth(),
      answer(),
      { category: true, status: true, reviewReason: null, defect: true, defectFields: null, endToEnd: null },
    ],
    [
      "a defect found with the right fields: right end to end",
      truth({ status: "MISMATCH", has_defect: true, defect_fields: ["consignee", "port_of_loading"] }),
      answer({ status: "MISMATCH", has_defect: true, defect_fields: ["port_of_loading", "consignee"] }),
      { category: true, status: true, reviewReason: null, defect: true, defectFields: true, endToEnd: true },
    ],
    [
      "a defect found with one field missing: the defect counts, end to end does not",
      truth({ status: "MISMATCH", has_defect: true, defect_fields: ["consignee", "port_of_loading"] }),
      answer({ status: "MISMATCH", has_defect: true, defect_fields: ["consignee"] }),
      { category: true, status: true, reviewReason: null, defect: true, defectFields: false, endToEnd: false },
    ],
    [
      "a defect missed",
      truth({ status: "MISMATCH", has_defect: true, defect_fields: ["consignee"] }),
      answer(),
      { category: true, status: false, reviewReason: null, defect: false, defectFields: false, endToEnd: false },
    ],
    [
      "an escalation with the wrong reason",
      truth({ status: "NEEDS_REVIEW", review_reason: "unreadable" }),
      answer({ status: "NEEDS_REVIEW", review_reason: "missing_attachment" }),
      { category: true, status: true, reviewReason: false, defect: null, defectFields: null, endToEnd: null },
    ],
    [
      "a comparison read as another category fails every document check",
      truth({ status: "MISMATCH", has_defect: true, defect_fields: ["consignee"] }),
      answer({ category: "SI_REQUEST", status: "MISMATCH", has_defect: true, defect_fields: ["consignee"] }),
      { category: false, status: false, reviewReason: null, defect: false, defectFields: false, endToEnd: false },
    ],
    [
      "a non-comparison: only the category is scored",
      truth({ category: "SPAM" }),
      answer({ category: "SPAM" }),
      { category: true, status: null, reviewReason: null, defect: null, defectFields: null, endToEnd: null },
    ],
  ] as const)("%s", (_name, gold, given, checks) => {
    expect(
      compareEmail("email_001", gold, { ...given, defect_fields: [...given.defect_fields] }, false, undefined).checks,
    ).toEqual(checks);
  });

  it("scores an email the run has no answer for as the scorer does: GENERAL", () => {
    const verdict = compareEmail("email_002", truth({ category: "SPAM" }), undefined, true, undefined);
    expect(verdict).toMatchObject({ submitted: false, inHoldout: true, answer: { category: "GENERAL" } });
    expect(verdict.checks.category).toBe(false);
    expect(verdict.classify).toBeNull();
  });

  it("carries the chain and what the verifier did to it", () => {
    const chain = {
      genCategory: "GENERAL",
      genConfidence: 0.62,
      verCategory: "SPAM",
      verConfidence: 0.91,
      decidedBy: "verifier",
      humanCategory: null,
      model: "sonnet",
      promptVersion: "v5",
    } as const;
    const verdict = compareEmail("email_003", truth({ category: "SPAM" }), answer({ category: "SPAM" }), false, chain);
    expect(verdict.classify).toEqual({ ...chain, effect: "fixed" });
  });
});
