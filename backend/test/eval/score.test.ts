import { describe, expect, it } from "vitest";

import type { TruthRow } from "../../src/contracts";
import { scoreAll, scoreEndToEnd, scoreReliability, scoreStage1, scoreStage3, type Submission } from "../../src/eval/score";

const ok = (category: TruthRow["category"]): TruthRow => ({
  category,
  status: "OK",
  review_reason: null,
  has_defect: false,
  defect_fields: [],
});
const mismatch = (...fields: TruthRow["defect_fields"]): TruthRow => ({
  category: "BL_COMPARISON",
  status: "MISMATCH",
  review_reason: null,
  has_defect: true,
  defect_fields: fields,
});
const review = (reason: NonNullable<TruthRow["review_reason"]>): TruthRow => ({
  category: "BL_COMPARISON",
  status: "NEEDS_REVIEW",
  review_reason: reason,
  has_defect: false,
  defect_fields: [],
});

// Eight emails, small enough to score by hand.
const truth: Record<string, TruthRow> = {
  e1: mismatch("consignee"),
  e2: mismatch("container_count", "gross_weight_kg"),
  e3: ok("BL_COMPARISON"),
  e4: review("unreadable"),
  e5: ok("SI_REQUEST"),
  e6: ok("INVOICE_QUERY"),
  e7: ok("GENERAL"),
  e8: ok("SPAM"),
};

const sub: Submission = {
  // Routed, flagged, exact fields: the only end-to-end success.
  e1: { category: "BL_COMPARISON", status: "MISMATCH", has_defect: true, defect_fields: ["consignee"], decided_by: "llm" },
  // Routed and flagged, but one field short: stage 3 credit, no end-to-end credit.
  e2: { category: "BL_COMPARISON", status: "MISMATCH", has_defect: true, defect_fields: ["container_count"], decided_by: "llm" },
  // Clean pair flagged as a defect: a false alarm.
  e3: { category: "BL_COMPARISON", status: "MISMATCH", has_defect: true, defect_fields: ["shipper"], decided_by: "rule" },
  e4: { category: "BL_COMPARISON", status: "NEEDS_REVIEW", review_reason: "unreadable", has_defect: false, defect_fields: [] },
  // Misclassified as GENERAL.
  e5: { category: "GENERAL", status: "OK", has_defect: false, defect_fields: [] },
  e6: { category: "INVOICE_QUERY", status: "NEEDS_REVIEW", has_defect: false, defect_fields: [] },
  // e7 is missing: the scorer reads it as GENERAL with no defect.
  e8: { category: "SPAM", status: "OK", has_defect: false, defect_fields: [] },
};

describe("scoreStage1", () => {
  it("defaults a missing email to GENERAL and averages F1 over all five categories", () => {
    const stage1 = scoreStage1(truth, sub);

    expect(stage1.accuracy).toBeCloseTo(7 / 8, 10);
    expect(stage1.per.SI_REQUEST).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(stage1.per.GENERAL).toEqual({ tp: 1, fp: 1, fn: 0 });
    // BL 1, SI 0, INVOICE 1, GENERAL 2/3, SPAM 1.
    expect(stage1.macro_f1).toBeCloseTo((1 + 0 + 1 + 2 / 3 + 1) / 5, 10);
    expect(stage1.confusion.SI_REQUEST).toEqual({ GENERAL: 1 });
    expect(stage1.confusion.GENERAL).toEqual({ GENERAL: 1 });
  });

  it("reports the rule share over the rows that say who decided", () => {
    expect(scoreStage1(truth, sub).rule_pct).toBeCloseTo(1 / 3, 10);
    expect(scoreStage1(truth, {}).rule_pct).toBeNull();
  });

  it("does not count a category it does not know as a false positive for anyone", () => {
    const stage1 = scoreStage1({ e8: ok("SPAM") }, { e8: { category: "PHISHING" } });
    expect(stage1.per.SPAM).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(stage1.confusion.SPAM).toEqual({ PHISHING: 1 });
  });
});

describe("scoreStage3", () => {
  it("grades only the comparable comparison emails", () => {
    const stage3 = scoreStage3(truth, sub);

    expect(stage3.doc_total).toBe(3);
    expect(stage3.defect_precision).toBeCloseTo(2 / 3, 10);
    expect(stage3.defect_recall).toBe(1);
    expect(stage3.defect_f1).toBeCloseTo(0.8, 10);
    // Fields: tp 2 (consignee, container_count), fp 1 (shipper), fn 1 (gross_weight_kg).
    expect(stage3.field_f1).toBeCloseTo(2 / 3, 10);
    expect(stage3.exact_match_rate).toBeCloseTo(1 / 3, 10);
  });

  it("ignores a defect on an email that was not routed to comparison", () => {
    const notRouted: Submission = { e1: { category: "GENERAL", has_defect: true, defect_fields: ["consignee"] } };
    const stage3 = scoreStage3({ e1: truth.e1 }, notRouted);
    expect(stage3.defect_recall).toBe(0);
    expect(stage3.field_f1).toBe(0);
  });
});

describe("scoreEndToEnd", () => {
  it("needs the route, the flag and the exact field set", () => {
    expect(scoreEndToEnd(truth, sub)).toEqual({ success: 1, total: 2, rate: 0.5 });
  });

  it("gives nothing for a superset of the right fields", () => {
    const eager: Submission = {
      e1: { category: "BL_COMPARISON", has_defect: true, defect_fields: ["consignee", "shipper"] },
    };
    expect(scoreEndToEnd({ e1: truth.e1 }, eager).rate).toBe(0);
  });
});

describe("scoreReliability", () => {
  it("separates escalating the right cases from escalating too many", () => {
    const reliability = scoreReliability(truth, sub);

    expect(reliability.gold_review).toBe(1);
    expect(reliability.pred_review).toBe(2);
    expect(reliability.escalation_recall).toBe(1);
    expect(reliability.escalation_precision).toBe(0.5);
    expect(reliability.per_reason.unreadable).toEqual({ total: 1, caught: 1 });
    expect(reliability.per_reason.missing_value).toEqual({ total: 0, caught: 0 });
  });
});

describe("scoreAll", () => {
  it("weights stage 1 at 0.30, stage 3 at 0.20 and end to end at 0.50", () => {
    const board = scoreAll(truth, sub);
    const expected = 0.3 * ((1 + 0 + 1 + 2 / 3 + 1) / 5) + 0.2 * 0.8 + 0.5 * 0.5;

    expect(board.final_score).toBeCloseTo(expected, 10);
    expect(board.n_emails).toBe(8);
    expect(board.weights).toEqual({ stage1: 0.3, stage3: 0.2, end_to_end: 0.5 });
  });

  it("scores only the ids it is given, which is how the holdout is scored", () => {
    const board = scoreAll(truth, sub, { only: ["e1", "e8", "not_in_truth"] });
    expect(board.n_emails).toBe(2);
    expect(board.end_to_end).toEqual({ success: 1, total: 1, rate: 1 });
    expect(board.stage1.accuracy).toBe(1);
  });

  it("scores an empty submission without dividing by zero", () => {
    const board = scoreAll(truth, {});
    expect(board.end_to_end.rate).toBe(0);
    expect(board.stage3.defect_f1).toBe(0);
    expect(Number.isFinite(board.final_score)).toBe(true);
  });
});
