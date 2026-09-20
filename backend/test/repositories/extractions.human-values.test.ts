import { describe, expect, it } from "vitest";

import { ComparisonField } from "../../src/contracts";
import { extractions } from "../../src/ontology/repositories";
import type { ExtractedFields } from "../../src/pipeline/compare";

/**
 * A person's reading replaces the model's, and it replaces all of it. The one
 * thing this has to get right is that the quote goes with the value it
 * described: a corrected value sitting beside the line the placeholder came
 * off tells the judge the correction is itself a placeholder.
 */

const read = (value: string | null, over: Partial<ExtractedFields["shipper"]> = {}) => ({
  value,
  placeholder: null,
  source_quote: value === null ? null : `Label: ${value}`,
  confidence: 0.95,
  note: null,
  ...over,
});

function stored(fields: Partial<ExtractedFields>, humanValues: Partial<Record<ComparisonField, string>>) {
  const all = Object.fromEntries(ComparisonField.options.map((field) => [field, read(`model ${field}`)])) as ExtractedFields;
  return {
    id: "1",
    documentId: "1",
    filename: "e_SI.txt",
    role: "SI" as const,
    promptVersion: "v1",
    model: "sonnet",
    verified: false,
    fields: { ...all, ...fields },
    humanValues,
    evidenceOk: Object.fromEntries(ComparisonField.options.map((field) => [field, true])) as Record<ComparisonField, boolean>,
  };
}

describe("withHumanValues", () => {
  it("leaves the model's reading alone where nobody corrected it", () => {
    const fields = extractions.withHumanValues(stored({}, {}));
    expect(fields.shipper).toEqual(read("model shipper"));
  });

  it("replaces the value, the placeholder and the quote that belonged to the value it replaced", () => {
    const blank = read(null, { placeholder: "N/A", source_quote: "Gross Weight (KGS): N/A", confidence: 0.9 });
    const fields = extractions.withHumanValues(stored({ gross_weight_kg: blank }, { gross_weight_kg: "235,550 KG" }));

    expect(fields.gross_weight_kg).toEqual({
      value: "235,550 KG",
      placeholder: null,
      source_quote: null,
      confidence: 1,
      note: "read off the document by a person",
    });
  });

  it("corrects only the field it was given", () => {
    const fields = extractions.withHumanValues(stored({}, { consignee: "AL GURG PAPER TRADING LLC" }));
    expect(fields.consignee.value).toBe("AL GURG PAPER TRADING LLC");
    expect(fields.notify_party).toEqual(read("model notify_party"));
  });
});
