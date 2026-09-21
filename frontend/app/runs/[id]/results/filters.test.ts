import { describe, expect, it } from "vitest";

import type { EmailVerdict } from "@/lib/api/scoring-schemas";

import { checkCounts, effectCounts, isWrong, matches, NO_FILTERS, wrongChecks } from "./filters";

/**
 * The shapes are real ones: a spam email the generator read as general and the
 * verifier rescued, and a comparison whose defect fields came out one short.
 */
function verdict(over: Partial<EmailVerdict> = {}): EmailVerdict {
  return {
    emailId: "email_013",
    inHoldout: false,
    submitted: true,
    answer: { category: "BL_COMPARISON", status: "MISMATCH", review_reason: null, has_defect: true, defect_fields: ["port_of_discharge"] },
    truth: { category: "BL_COMPARISON", status: "MISMATCH", review_reason: null, has_defect: true, defect_fields: ["port_of_discharge", "consignee"] },
    checks: { category: true, status: true, reviewReason: null, defect: true, defectFields: false, endToEnd: false },
    classify: {
      genCategory: "BL_COMPARISON",
      genConfidence: 0.96,
      verCategory: null,
      verConfidence: null,
      decidedBy: "llm",
      humanCategory: null,
      model: "sonnet",
      promptVersion: "v5",
      effect: "not_run",
    },
    ...over,
  };
}

const rescued = verdict({
  emailId: "email_101",
  inHoldout: true,
  answer: { category: "SPAM", status: "OK", review_reason: null, has_defect: false, defect_fields: [] },
  truth: { category: "SPAM", status: "OK", review_reason: null, has_defect: false, defect_fields: [] },
  checks: { category: true, status: null, reviewReason: null, defect: null, defectFields: null, endToEnd: null },
  classify: {
    genCategory: "GENERAL",
    genConfidence: 0.61,
    verCategory: "SPAM",
    verConfidence: 0.9,
    decidedBy: "verifier",
    humanCategory: null,
    model: "sonnet",
    promptVersion: "v5",
    effect: "fixed",
  },
});

const unclassified = verdict({ emailId: "email_202", classify: null });

describe("wrongChecks", () => {
  it("names only the checks that were scored and failed", () => {
    expect(wrongChecks(verdict())).toEqual(["defectFields", "endToEnd"]);
  });

  it("does not count a check the scorer did not score here", () => {
    expect(wrongChecks(rescued)).toEqual([]);
    expect(isWrong(rescued)).toBe(false);
  });
});

describe("matches", () => {
  const all = [verdict(), rescued, unclassified];
  const shown = (filters: Parameters<typeof matches>[1]) => all.filter((one) => matches(one, filters)).map((one) => one.emailId);

  it.each([
    ["nothing set shows every email", NO_FILTERS, ["email_013", "email_101", "email_202"]],
    ["only the wrong ones", { ...NO_FILTERS, outcome: "wrong" as const }, ["email_013", "email_202"]],
    ["only the clean ones", { ...NO_FILTERS, outcome: "right" as const }, ["email_101"]],
    ["one check, wrong", { ...NO_FILTERS, check: "defectFields" as const }, ["email_013", "email_202"]],
    ["a check nothing failed", { ...NO_FILTERS, check: "category" as const }, []],
    ["what the verifier did", { ...NO_FILTERS, effect: "fixed" as const }, ["email_101"]],
    ["an effect no email had", { ...NO_FILTERS, effect: "broke" as const }, []],
    ["by the truth's category", { ...NO_FILTERS, truth: "SPAM" as const }, ["email_101"]],
    ["by the answer's category", { ...NO_FILTERS, answer: "SPAM" as const }, ["email_101"]],
    ["the holdout only", { ...NO_FILTERS, split: "holdout" as const }, ["email_101"]],
    ["the train split only", { ...NO_FILTERS, split: "train" as const }, ["email_013", "email_202"]],
    ["a search on the id", { ...NO_FILTERS, q: "_101" }, ["email_101"]],
    ["a search that is only whitespace and case", { ...NO_FILTERS, q: "  EMAIL_013 " }, ["email_013"]],
    ["two filters at once", { ...NO_FILTERS, outcome: "wrong" as const, q: "013" }, ["email_013"]],
  ])("%s", (_name, filters, expected) => {
    expect(shown(filters)).toEqual(expected);
  });

  it("an email that was never classified matches no effect filter", () => {
    expect(matches(unclassified, { ...NO_FILTERS, effect: "not_run" })).toBe(false);
  });
});

describe("counts", () => {
  it("counts each way of being wrong once per email", () => {
    expect(checkCounts([verdict(), rescued, unclassified])).toEqual({
      category: 0,
      status: 0,
      reviewReason: 0,
      defect: 0,
      defectFields: 2,
      endToEnd: 2,
    });
  });

  it("counts the effects and leaves out the email with no chain", () => {
    expect(effectCounts([verdict(), rescued, unclassified])).toEqual({ not_run: 1, fixed: 1 });
  });
});
