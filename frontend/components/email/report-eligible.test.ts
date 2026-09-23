import { describe, expect, it } from "vitest";

import type { DocumentView, EmailTrace } from "@/lib/api/trace-schemas";

import { docTypeLabel, hasReport, wrongDocType, wrongDocuments } from "./report-eligible";

function trace(over: Partial<EmailTrace> = {}): EmailTrace {
  return {
    emailId: "email_501",
    stage: "review",
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

function document(over: Partial<DocumentView> = {}): DocumentView {
  return {
    filename: "e_BL.txt",
    role: "BL",
    docType: "INVOICE",
    docTypeConfidence: 0.96,
    docTypeRationale: "The file is a commercial invoice.",
    typeVerdict: "wrong_type",
    format: "txt",
    pages: 1,
    scanned: false,
    unreadable: false,
    warnings: [],
    pageConfidence: [],
    bytes: 100,
    origin: "source",
    objectKey: "runs/x/e_BL.txt",
    textObjectKey: "runs/x/e_BL.txt.txt",
    ...over,
  };
}

describe("report eligibility", () => {
  it("a compared pair earns a report", () => {
    const email = trace({
      comparison: {
        status: "OK",
        reviewReason: null,
        defectFields: [],
        fields: [{ field: "consignee", siValue: "A", blValue: "A", same: true, missing: false, confidence: 1, rationale: null }],
        detail: {},
      },
    });
    expect(hasReport(email)).toBe(true);
    expect(wrongDocType(email)).toBe(false);
  });

  it("a wrong document earns a report even when no field was read", () => {
    const email = trace({
      comparison: { status: "NEEDS_REVIEW", reviewReason: "wrong_doc_type", defectFields: [], fields: [], detail: {} },
      documents: [document()],
    });
    expect(hasReport(email)).toBe(true);
    expect(wrongDocType(email)).toBe(true);
    expect(wrongDocuments(email)).toHaveLength(1);
  });

  it("spam with no comparison does not earn a report", () => {
    expect(hasReport(trace())).toBe(false);
  });

  it("doc types read in plain English", () => {
    expect(docTypeLabel("INVOICE")).toBe("Commercial invoice");
    expect(docTypeLabel(null)).toBe("not typed");
  });
});
