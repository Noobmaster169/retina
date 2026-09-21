import { describe, expect, it } from "vitest";

import { checkStructure, DOC_TYPE_TRUST_FROM, documentVerdicts, type DocumentSummary } from "../../src/pipeline/compare";

function doc(overrides: Partial<DocumentSummary> & Pick<DocumentSummary, "filename" | "role">): DocumentSummary {
  const fields = {
    docType: null,
    format: "txt" as const,
    unreadable: false,
    scanned: false,
    warnings: [],
    docTypeRationale: null,
    ...overrides,
  };
  // The model never answers with a kind and no confidence in it, so neither does a fixture.
  return { docTypeConfidence: fields.docType === null ? null : 0.95, ...fields };
}

const si = doc({ filename: "e_SI.txt", role: "SI", docType: "SI" });
const bl = doc({ filename: "e_BL.txt", role: "BL", docType: "BL" });

describe("checkStructure", () => {
  it("a readable SI and BL pair is comparable", () => {
    expect(checkStructure([si, bl], null)).toEqual({ kind: "compare", si: "e_SI.txt", bl: "e_BL.txt", extras: [], swapped: false });
  });

  it("a file the parser could not read is escalated as unreadable, with the parser's reasons", () => {
    const broken = doc({ filename: "e_BL.pdf", role: "BL", format: "pdf", unreadable: true, warnings: ["could not open: no xref"] });
    expect(checkStructure([si, broken], null)).toEqual({
      kind: "review",
      reason: "unreadable",
      detail: { files: [{ filename: "e_BL.pdf", warnings: ["could not open: no xref"], scanned: false }] },
    });
  });

  it("a document read by looking at it is compared like any other", () => {
    // It has text, so nothing structural is wrong with it. Escalating on sight made
    // a clean scan and a truncated file mean the same thing to everyone downstream.
    const scan = doc({
      filename: "e_BL.pdf",
      role: "BL",
      format: "pdf",
      scanned: true,
      docType: "BL",
      warnings: ["page 1: no text layer, sent to be read as an image"],
    });
    expect(checkStructure([si, scan], null)).toMatchObject({ kind: "compare" });
  });

  it("a document nothing could make out is still unreadable", () => {
    const blank = doc({ filename: "e_BL.pdf", role: "BL", format: "pdf", scanned: true, unreadable: true, warnings: ["too faint to read"] });
    expect(checkStructure([si, blank], null)).toMatchObject({ kind: "review", reason: "unreadable" });
  });

  it.each(["INVOICE", "PACKING_LIST", "COO", "OTHER"] as const)("a %s where a BL was claimed is a wrong document type", (docType) => {
    const wrong = doc({ filename: "e_BL.txt", role: "BL", docType, docTypeConfidence: 0.97, docTypeRationale: "It says what it is." });
    expect(checkStructure([si, wrong], null)).toEqual({
      kind: "review",
      reason: "wrong_doc_type",
      detail: { files: [{ filename: "e_BL.txt", claimed: "BL", detected: docType, confidence: 0.97, rationale: "It says what it is." }] },
    });
  });

  it("a document the model could not type is taken at its filename's word", () => {
    expect(checkStructure([si, doc({ filename: "e_BL.txt", role: "BL", docType: null })], null)).toMatchObject({ kind: "compare" });
  });

  it("a reading the model is unsure of does not displace the filename's claim", () => {
    const unsure = doc({ filename: "e_BL.xlsx", role: "BL", docType: "OTHER", docTypeConfidence: DOC_TYPE_TRUST_FROM - 0.01 });
    expect(checkStructure([si, unsure], null)).toMatchObject({ kind: "compare", bl: "e_BL.xlsx" });

    const sure = doc({ filename: "e_BL.xlsx", role: "BL", docType: "OTHER", docTypeConfidence: DOC_TYPE_TRUST_FROM });
    expect(checkStructure([si, sure], null)).toMatchObject({ kind: "review", reason: "wrong_doc_type" });
  });

  it("a third file beside a good pair is an extra, not the pair being wrong", () => {
    const alsoSent = doc({ filename: "e_invoice.pdf", role: "UNKNOWN", format: "pdf", docType: "INVOICE", docTypeConfidence: 0.96 });
    expect(checkStructure([si, bl, alsoSent], null)).toEqual({
      kind: "compare",
      si: "e_SI.txt",
      bl: "e_BL.txt",
      extras: ["e_invoice.pdf"],
      swapped: false,
    });
  });

  it("only the SI is a missing attachment, naming what arrived", () => {
    expect(checkStructure([si], null)).toEqual({
      kind: "review",
      reason: "missing_attachment",
      detail: { missing: ["BL"], note: "attached: e_SI.txt; no BL among them", attachments: ["e_SI.txt"] },
    });
  });

  it("nothing attached: the model's reading decides between awaiting the draft and a missing attachment", () => {
    expect(checkStructure([], "send_draft")).toMatchObject({ kind: "awaiting_draft", detail: { awaiting_draft: true } });
    expect(checkStructure([], "compare_documents")).toMatchObject({ kind: "review", reason: "missing_attachment", detail: { missing: ["SI", "BL"] } });
  });

  it("precedence when several apply: unreadable over wrong_doc_type over missing_attachment", () => {
    const broken = doc({ filename: "e_SI.pdf", role: "SI", format: "pdf", unreadable: true });
    const invoice = doc({ filename: "e_BL.txt", role: "BL", docType: "INVOICE", docTypeConfidence: 0.96 });
    expect(checkStructure([broken, invoice], null)).toMatchObject({ reason: "unreadable" });
    expect(checkStructure([invoice], null)).toMatchObject({ reason: "wrong_doc_type" });
  });

  it("a pair the model reads the other way round is still comparable, swapped, and says so", () => {
    const crossed = [doc({ filename: "a_SI.txt", role: "SI", docType: "BL" }), doc({ filename: "b_BL.txt", role: "BL", docType: "SI" })];
    expect(checkStructure(crossed, null)).toEqual({ kind: "compare", si: "b_BL.txt", bl: "a_SI.txt", extras: [], swapped: true });
  });
});

describe("documentVerdicts: the reading a page shows is the reading the check acted on", () => {
  it("says nothing about a document the model has not read", () => {
    expect(documentVerdicts([doc({ filename: "e_BL.pdf", role: "BL" })]).get("e_BL.pdf")).toBe("unknown");
  });

  it("marks the document the check escalates, and only that one", () => {
    const wrong = doc({ filename: "e_BL.txt", role: "BL", docType: "COO", docTypeConfidence: 0.96 });
    const verdicts = documentVerdicts([si, wrong]);
    expect(verdicts.get("e_BL.txt")).toBe("wrong_type");
    expect(verdicts.get("e_SI.txt")).toBe("ok");
  });

  it("calls a crossed pair crossed, not wrong: neither file is the wrong kind of document", () => {
    const crossed = [doc({ filename: "a_SI.txt", role: "SI", docType: "BL" }), doc({ filename: "b_BL.txt", role: "BL", docType: "SI" })];
    expect([...documentVerdicts(crossed).values()]).toEqual(["crossed", "crossed"]);
  });

  it("leaves an extra alone however the model reads it", () => {
    const alsoSent = doc({ filename: "e_invoice.pdf", role: "UNKNOWN", docType: "INVOICE", docTypeConfidence: 0.99 });
    expect(documentVerdicts([si, bl, alsoSent]).get("e_invoice.pdf")).toBe("ok");
  });
});
