import type { ComparisonField } from "../../contracts";

/**
 * One of the seven fields as the extractor read it from one document. The
 * shape the model answers in, kept as is through the pipeline: `value` is
 * verbatim from the document, null where the label is absent or a placeholder
 * stands in for the value.
 */
export interface ExtractedField {
  value: string | null;
  /** The stand-in text found beside the label, when that is why the value is null. */
  placeholder: string | null;
  /** The exact line the value was taken from, so the evidence check can find it. */
  source_quote: string | null;
  confidence: number;
  note: string | null;
}

export type ExtractedFields = Record<ComparisonField, ExtractedField>;

/** The judge's word on one field with a value on both sides. */
export interface Judgement {
  rationale: string;
  same: boolean;
  /** The judge read one of the values as a stand-in for a value not yet known. */
  missing: boolean;
  confidence: number;
}

/** An extracted field the pipeline gave up on: the value could not be located, and the field is treated as not given. */
export function unlocated(field: ExtractedField, why: string): ExtractedField {
  return { value: null, placeholder: null, source_quote: field.source_quote, confidence: 0, note: why };
}
