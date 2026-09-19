import { describe, expect, it } from "vitest";

import { checkStructure, type DocumentSummary } from "../../src/pipeline/compare";

function doc(overrides: Partial<DocumentSummary> & Pick<DocumentSummary, "filename" | "role">): DocumentSummary {
  return {
    docType: null,
    bytes: 600,
    format: "txt",
    unreadable: false,
    scanned: false,
    warnings: [],
    docTypeConfidence: null,
    docTypeRationale: null,
    ...overrides,
  };
}

const si = doc({ filename: "e_SI.txt", role: "SI", docType: "SI" });
const bl = doc({ filename: "e_BL.txt", role: "BL", docType: "BL" });

describe("checkStructure", () => {
  it("a readable SI and BL pair is comparable", () => {
    expect(checkStructure([si, bl], null)).toEqual({ kind: "compare", si: "e_SI.txt", bl: "e_BL.txt", extras: [] });
  });

  it("a file the parser could not read is escalated as unreadable, with the parser's reasons", () => {
    const broken = doc({ filename: "e_BL.pdf", role: "BL", format: "pdf", unreadable: true, warnings: ["could not open: no xref"] });
    expect(checkStructure([si, broken], null)).toEqual({
      kind: "review",
      reason: "unreadable",
      detail: { files: [{ filename: "e_BL.pdf", warnings: ["could not open: no xref"], scanned: false }] },
    });
  });

  it("a scan is escalated as unreadable too, never silently trusted, with room for a provisional result", () => {
    const scan = doc({ filename: "e_BL.pdf", role: "BL", format: "pdf", scanned: true, docType: "BL", warnings: ["page 1: read by OCR"] });
    expect(checkStructure([si, scan], null)).toMatchObject({
      kind: "review",
      reason: "unreadable",
      detail: { scanned: true, files: [{ filename: "e_BL.pdf", scanned: true }], provisional: null },
    });
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
    const invoice = doc({ filename: "e_BL.txt", role: "BL", docType: "INVOICE" });
    expect(checkStructure([broken, invoice], null)).toMatchObject({ reason: "unreadable" });
    expect(checkStructure([invoice], null)).toMatchObject({ reason: "wrong_doc_type" });
  });

  it("a pair the model reads the other way round is still comparable, swapped", () => {
    const crossed = [doc({ filename: "a_SI.txt", role: "SI", docType: "BL" }), doc({ filename: "b_BL.txt", role: "BL", docType: "SI" })];
    expect(checkStructure(crossed, null)).toEqual({ kind: "compare", si: "b_BL.txt", bl: "a_SI.txt", extras: [] });
  });
});
