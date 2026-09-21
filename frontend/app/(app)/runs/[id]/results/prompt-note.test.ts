import { describe, expect, it } from "vitest";

import type { EmailVerdict } from "@/lib/api/scoring-schemas";
import { EmailTrace } from "@/lib/api/trace-schemas";

import { promptNote } from "./prompt-note";

/**
 * The note is evidence, so the test is about what survives into it verbatim:
 * a rationale, a counter-case and a call's own text, none of them reworded.
 */

const verdict: EmailVerdict = {
  emailId: "email_013",
  inHoldout: false,
  submitted: true,
  answer: { category: "BL_COMPARISON", status: "MISMATCH", review_reason: null, has_defect: true, defect_fields: ["port_of_discharge"] },
  truth: { category: "BL_COMPARISON", status: "MISMATCH", review_reason: null, has_defect: true, defect_fields: ["port_of_discharge", "consignee"] },
  checks: { category: true, status: true, reviewReason: null, defect: true, defectFields: false, endToEnd: false },
  classify: {
    genCategory: "BL_COMPARISON",
    genConfidence: 0.88,
    verCategory: "BL_COMPARISON",
    verConfidence: 0.93,
    decidedBy: "verifier",
    humanCategory: null,
    model: "sonnet",
    promptVersion: "v5",
    effect: "agreed_right",
  },
};

const trace: EmailTrace = EmailTrace.parse({
  emailId: "email_013",
  stage: "done",
  error: null,
  classification: {
    finalCategory: "BL_COMPARISON",
    humanCategory: null,
    decidedBy: "verifier",
    generator: { category: "BL_COMPARISON", confidence: 0.88, rationale: "A draft bill is attached against an instruction." },
    verifier: {
      category: "BL_COMPARISON",
      confidence: 0.93,
      rationale: "The proposal holds.",
      counterCases: "SI_REQUEST would need a request for a document that is not here.",
    },
    verifierError: null,
    model: "sonnet",
    promptVersion: "v5",
  },
  documents: [],
  review: null,
  extractions: [],
  comparison: {
    status: "MISMATCH",
    reviewReason: null,
    defectFields: ["port_of_discharge"],
    fields: [
      {
        field: "port_of_discharge",
        siValue: "MOMBASA, KENYA",
        blValue: "TUTICORIN, INDIA (KEMBA)",
        same: false,
        missing: false,
        confidence: 0.96,
        rationale: "Two different cities in two different countries.",
      },
    ],
    detail: {},
  },
  live: null,
  calls: [
    {
      id: "7",
      emailId: "email_013",
      step: "classify",
      model: "sonnet",
      promptVersion: "v5",
      attempt: 1,
      ok: true,
      error: null,
      parsed: null,
      latencyMs: 2100,
      createdAt: "2026-09-21T00:00:00.000Z",
      system: "the prompt file",
      user: "Subject: draft BL for checking",
      responseText: '{"category":"BL_COMPARISON"}',
      inputTokens: 1200,
      outputTokens: 40,
      costUsd: 0.01,
    },
  ],
});

describe("promptNote", () => {
  it.each([
    ["names the email and its split", "email_013 (train)"],
    ["marks the failed check in a way a search finds", "Defect fields  WRONG"],
    ["keeps the truth beside the answer", "truth:    BL_COMPARISON MISMATCH"],
    ["quotes the generator word for word", "A draft bill is attached against an instruction."],
    ["quotes the counter-cases", "SI_REQUEST would need a request for a document that is not here."],
    ["quotes the judge on the field that differed", "Two different cities in two different countries."],
    ["carries what the model was given and what it wrote", "Subject: draft BL for checking"],
    ["says where the system prompts are rather than pasting them", "agents/prompts"],
  ])("%s", (_name, expected) => {
    expect(promptNote(verdict, trace)).toContain(expected);
  });

  it("is still worth copying before the trace has arrived", () => {
    const note = promptNote(verdict, undefined);
    expect(note).toContain("email_013");
    expect(note).toContain("said BL_COMPARISON at 0.88");
    expect(note).not.toContain("THE CALLS");
  });

  it("says the verifier did not run rather than leaving it out", () => {
    const chain = verdict.classify;
    if (!chain) throw new Error("the fixture has a chain");
    const alone = { ...verdict, classify: { ...chain, verCategory: null, verConfidence: null } };
    expect(promptNote(alone, trace)).toContain("did not run");
  });
});
