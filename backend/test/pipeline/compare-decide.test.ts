import { describe, expect, it } from "vitest";

import { type Assembled, decide, decisionDetail, type FieldJudgement } from "../../src/pipeline/compare";

const judged = (field: FieldJudgement["field"], same: boolean, missing = false): FieldJudgement => ({
  field,
  siValue: "a",
  blValue: "b",
  same,
  missing,
  confidence: 0.9,
  rationale: "because",
});

const assembled = (fields: FieldJudgement[]): Assembled => ({
  fields,
  defectFields: fields.filter((f) => !f.same && !f.missing).map((f) => f.field),
  missing: fields.filter((f) => f.missing).map((f) => f.field),
});

describe("decide", () => {
  it.each([
    ["nothing differs", [judged("shipper", true), judged("consignee", true)], { status: "OK", reviewReason: null, defectFields: [], missing: [] }],
    ["one field differs", [judged("shipper", true), judged("container_count", false)], { status: "MISMATCH", reviewReason: null, defectFields: ["container_count"], missing: [] }],
    [
      "two fields differ",
      [judged("consignee", false), judged("notify_party", false)],
      { status: "MISMATCH", reviewReason: null, defectFields: ["consignee", "notify_party"], missing: [] },
    ],
    [
      "a missing value outranks a defect: the reviewer sees the defect as provisional",
      [judged("gross_weight_kg", false, true), judged("shipper", false)],
      { status: "NEEDS_REVIEW", reviewReason: "missing_value", defectFields: ["shipper"], missing: ["gross_weight_kg"] },
    ],
    ["a missing value alone", [judged("port_of_loading", false, true)], { status: "NEEDS_REVIEW", reviewReason: "missing_value", defectFields: [], missing: ["port_of_loading"] }],
  ] as const)("%s", (_name, fields, expected) => {
    expect(decide(assembled([...fields]))).toEqual(expected);
  });

  it("records the decision in the organisers' names for the review case and the comparison row", () => {
    const decision = decide(assembled([judged("gross_weight_kg", false, true), judged("shipper", false)]));
    expect(decisionDetail(decision)).toEqual({
      status: "NEEDS_REVIEW",
      review_reason: "missing_value",
      defect_fields: ["shipper"],
      missing: ["gross_weight_kg"],
    });
  });
});
