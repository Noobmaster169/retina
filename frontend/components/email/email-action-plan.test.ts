import { describe, expect, it } from "vitest";

import type { Category, ClassificationView, EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";
import type { ReviewReason } from "@/lib/api/runs-schemas";

import { planEmailActions } from "./email-action-plan";

function trace(over: Partial<EmailTrace> = {}): EmailTrace {
  return {
    emailId: "email_001",
    stage: "done",
    error: null,
    classification: null,
    documents: [],
    review: null,
    extractions: [],
    comparison: null,
    live: null,
    calls: [],
    ...over,
  };
}

function classified(category: Category): ClassificationView {
  return {
    finalCategory: category,
    humanCategory: null,
    decidedBy: "llm",
    generator: { category, confidence: 1, rationale: "" },
    verifier: null,
    verifierError: null,
    model: "sonnet",
    promptVersion: "v1",
  };
}

function compared(fields: Array<{ field: "consignee"; same: boolean; missing?: boolean }>): Partial<EmailTrace> {
  return {
    comparison: {
      status: "MISMATCH" as const,
      reviewReason: null,
      defectFields: fields.filter((one) => !one.same && !one.missing).map((one) => one.field),
      fields: fields.map((one) => ({
        field: one.field as "consignee",
        same: one.same,
        missing: one.missing ?? false,
        siValue: "a",
        blValue: one.missing ? null : "b",
        rationale: null,
        confidence: 1,
      })),
      detail: {},
    },
    extractions: [
      { filename: "a_SI.txt", role: "SI" as const, verified: true, promptVersion: "v1", model: "sonnet", fields: [] },
      { filename: "a_BL.txt", role: "BL" as const, verified: true, promptVersion: "v1", model: "sonnet", fields: [] },
    ],
  };
}

function openCase(reason: ReviewReason): ReviewCaseView {
  return {
    id: "case_1",
    kind: "review",
    status: "open",
    reason,
    stage: "compare",
    detail: {},
    openedAt: "2026-01-01T00:00:00Z",
    resolvedAt: null,
    resolvedBy: null,
    actions: [],
  };
}

describe("planEmailActions", () => {
  it("caps every plan at two actions", () => {
    const plans = [
      planEmailActions(trace({ classification: classified("BL_COMPARISON"), ...compared([{ field: "consignee", same: false }]) })),
      planEmailActions(trace({ classification: classified("INVOICE_QUERY") }), openCase("missing_attachment")),
    ];
    for (const plan of plans) expect(plan.length).toBeLessThanOrEqual(2);
  });

  it("offers recommend then draft on a bill check with a mismatch", () => {
    const plan = planEmailActions(trace({ classification: classified("BL_COMPARISON"), ...compared([{ field: "consignee", same: false }]) }));
    expect(plan.map((one) => one.kind)).toEqual(["recommend", "draft"]);
  });

  it("offers answer then draft on an invoice with no comparison", () => {
    const plan = planEmailActions(trace({ classification: classified("INVOICE_QUERY") }));
    expect(plan.map((one) => one.kind)).toEqual(["answer-invoice", "draft"]);
  });

  it("offers ask then settle on an open file case", () => {
    const plan = planEmailActions(trace({ classification: classified("SI_REQUEST") }), openCase("unreadable"));
    expect(plan.map((one) => one.kind)).toEqual(["ask-sender", "settle-case"]);
  });

  it("offers settle then draft on an open invoice blank-value case", () => {
    const plan = planEmailActions(trace({ classification: classified("INVOICE_QUERY") }), openCase("missing_value"));
    expect(plan.map((one) => one.kind)).toEqual(["settle-case", "draft"]);
  });

  it("offers nothing on spam with no comparison", () => {
    expect(planEmailActions(trace({ classification: classified("SPAM") }))).toEqual([]);
  });
});
