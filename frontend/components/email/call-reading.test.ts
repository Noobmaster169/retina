import { describe, expect, it } from "vitest";

import { readCall } from "./call-reading";

/**
 * The answers are real ones, copied from a run's `llm_calls` and cut to the
 * keys the reading uses, so a shape change in the pipeline fails here rather
 * than showing a blank line on the page.
 */

const classify = { category: "BL_COMPARISON", confidence: 0.98, rationale: "The body asks the recipient to verify the draft BL." };

const extract = {
  shipper: { value: "ASIA PACIFIC PAPERBOARD TRADING PTE LTD", confidence: 0.98, source_quote: "SHIPPER: ASIA PACIFIC" },
  consignee: { value: "PACIFIC OFFICE (M) SDN BHD", confidence: 0.97, source_quote: "CONSIGNEE: PACIFIC OFFICE" },
  notify_party: { value: null, confidence: 0, source_quote: "" },
};

const judged = {
  shipper: { same: true, missing: false, rationale: "Identical.", confidence: 0.99 },
  consignee: { same: true, missing: false, rationale: "Identical.", confidence: 0.98 },
  container_count: { same: false, missing: false, rationale: "3 against 5.", confidence: 0.99 },
  gross_weight_kg: { same: false, missing: true, rationale: "Nothing on the BL.", confidence: 0.9 },
};

describe("readCall", () => {
  const cases: [string, { step: string; parsed: unknown }, { line: string | null; facts: string[]; quote: string | null }][] = [
    [
      "classify names the category it chose",
      { step: "classify", parsed: classify },
      { line: "Sorted it into BL_COMPARISON.", facts: ["sure 0.98"], quote: classify.rationale },
    ],
    [
      "the verifier says it came back to the same one",
      { step: "classify-verify", parsed: { ...classify, agrees: true } },
      { line: "Argued the other categories and still came back to BL_COMPARISON.", facts: ["sure 0.98"], quote: classify.rationale },
    ],
    [
      "the verifier says it overruled",
      { step: "classify-verify", parsed: { ...classify, agrees: false, category: "SPAM" } },
      { line: "Argued the other categories and said SPAM instead.", facts: ["sure 0.98"], quote: classify.rationale },
    ],
    [
      "triage names the request",
      { step: "triage", parsed: { request: "send_draft", confidence: 0.95, rationale: "It asks for the draft." } },
      { line: "Read the request as send_draft.", facts: ["sure 0.95"], quote: "It asks for the draft." },
    ],
    [
      "doc-type names what the file turned out to be",
      { step: "doc-type", parsed: { doc_type: "SI", confidence: 0.91, rationale: "It labels itself BL INSTRUCTION." } },
      { line: "Named the file SI.", facts: ["sure 0.91"], quote: "It labels itself BL INSTRUCTION." },
    ],
    [
      "extract counts what it found and names what it did not",
      { step: "extract", parsed: extract },
      { line: "Read 2 of 3 fields out of the document.", facts: ["nothing for notify_party"], quote: null },
    ],
    [
      "the judge counts the three verdicts and names the differing fields",
      { step: "field-judge", parsed: judged },
      { line: "Judged 4 fields: 2 the same, 1 different and 1 with nothing to compare.", facts: ["differ container_count"], quote: null },
    ],
    [
      "the shipment reader lists what it put in the model",
      {
        step: "shipment-read",
        parsed: {
          parties: [{}, {}],
          people: [{}],
          ports: { port_of_loading: { value: "SINGAPORE" }, port_of_discharge: null },
          goods: { value: "PAPERBOARD" },
          vessel: null,
          carrier: null,
        },
      },
      { line: "Read 2 companies, 1 person, 1 port and what is being shipped out of it.", facts: [], quote: null },
    ],
    [
      "a shipment read that found nothing says so",
      { step: "shipment-read", parsed: { parties: [], people: [], ports: { port_of_loading: null, port_of_discharge: null } } },
      { line: "Found nothing in it to put in the model.", facts: [], quote: null },
    ],
    [
      "a step this file does not know keeps its reasoning and invents no sentence",
      { step: "concept-judge", parsed: { rationale: "Both spellings name one port.", verdict: "same" } },
      { line: null, facts: [], quote: "Both spellings name one port." },
    ],
    ["an answer that does not narrow reads as nothing", { step: "classify", parsed: { category: 7 } }, { line: null, facts: [], quote: null }],
    ["a failed call carries no answer at all", { step: "extract", parsed: null }, { line: null, facts: [], quote: null }],
  ];

  it.each(cases)("%s", (_name, call, want) => {
    const got = readCall(call);
    expect(got.line).toBe(want.line);
    expect(got.quote).toBe(want.quote);
    expect(got.facts.map((fact) => `${fact.label} ${fact.value}`)).toEqual(want.facts);
  });
});
