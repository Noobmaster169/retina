import { describe, expect, it } from "vitest";

import { resolveRoles, triage, type TriageAttachment } from "../../src/pipeline/compare";

const file = (filename: string, role: TriageAttachment["role"]): TriageAttachment => ({ filename, role, bytes: 600 });
const si = file("email_004_SI.txt", "SI");
const bl = file("email_004_BL.txt", "BL");

describe("triage: which attachments are present is a fact, and code decides on it", () => {
  it.each([
    ["an SI and a BL", [si, bl], { kind: "compare", si: si.filename, bl: bl.filename, extras: [] }],
    ["only the SI", [si], { kind: "missing_attachment", missing: ["BL"] }],
    ["only the BL", [bl], { kind: "missing_attachment", missing: ["SI"] }],
    ["files that claim nothing", [file("scan.pdf", "UNKNOWN")], { kind: "missing_attachment", missing: ["SI", "BL"] }],
  ] as const)("%s", (_name, attachments, expected) => {
    expect(triage({ request: null, attachments: [...attachments] })).toMatchObject(expected);
  });

  it("keeps the first of each role and lists the rest as extras", () => {
    const second = file("email_004_BL_v2.txt", "BL");
    const note = file("note.pdf", "UNKNOWN");
    expect(triage({ request: null, attachments: [si, bl, second, note] })).toEqual({
      kind: "compare",
      si: si.filename,
      bl: bl.filename,
      extras: [second.filename, note.filename],
    });
  });
});

describe("triage: with nothing attached, the model's reading of the request decides", () => {
  it("a request to send the draft is awaiting the draft: nothing to compare, nothing missing", () => {
    expect(triage({ request: "send_draft", attachments: [] })).toMatchObject({ kind: "awaiting_draft" });
  });

  it("a request to compare documents that did not arrive is a missing attachment", () => {
    expect(triage({ request: "compare_documents", attachments: [] })).toMatchObject({ kind: "missing_attachment", missing: ["SI", "BL"] });
  });

  it("refuses to guess without the model's reading", () => {
    expect(() => triage({ request: null, attachments: [] })).toThrow(/needs the model's reading/);
  });

  it("does not consult the reading when files are attached", () => {
    expect(triage({ request: "send_draft", attachments: [si] })).toMatchObject({ kind: "missing_attachment", missing: ["BL"] });
  });
});

describe("resolveRoles: the filename's claim first, then the model's word", () => {
  const doc = (filename: string, role: TriageAttachment["role"], docType: "SI" | "BL" | "INVOICE" | null) => ({ filename, role, docType, bytes: 1 });

  it("keeps a claimed role even when the model reads it as another shipping document", () => {
    expect(resolveRoles([doc("a_SI.txt", "SI", "SI"), doc("b_BL.txt", "BL", "BL")]).map((d) => d.role)).toEqual(["SI", "BL"]);
  });

  it("gives a file that claims nothing the role the model read", () => {
    expect(resolveRoles([doc("scan1.pdf", "UNKNOWN", "SI"), doc("scan2.pdf", "UNKNOWN", "BL")]).map((d) => d.role)).toEqual(["SI", "BL"]);
  });

  it("leaves a file that claims nothing and is not a shipping document as unknown", () => {
    expect(resolveRoles([doc("inv.txt", "UNKNOWN", "INVOICE"), doc("x.pdf", "UNKNOWN", null)]).map((d) => d.role)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });

  it("swaps a pair the model reads the other way round", () => {
    const roles = resolveRoles([doc("a_SI.txt", "SI", "BL"), doc("b_BL.txt", "BL", "SI")]);
    expect(roles).toEqual([
      { filename: "a_SI.txt", role: "BL", bytes: 1 },
      { filename: "b_BL.txt", role: "SI", bytes: 1 },
    ]);
  });
});
