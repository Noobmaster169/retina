import { z } from "zod";

import { ComparisonField, ComparisonStatus, ReviewReason } from "./contracts.scoring";

/**
 * What the compare stage read from each document and how it judged the pair.
 * Re-exported from contracts.ts; mirrored in frontend/lib/api/trace-schemas.ts
 * and runs-schemas.ts.
 */

/** One of the seven fields as the extractor read it from one document. */
export const ExtractedFieldView = z.object({
  field: ComparisonField,
  /** Verbatim from the document. Null where the label is absent or a placeholder stands in for the value. */
  value: z.string().nullable(),
  /** The placeholder text found beside the label, when that is why the value is null. */
  placeholder: z.string().nullable(),
  sourceQuote: z.string().nullable(),
  confidence: z.number(),
  /** Whether the quote was found in the text and the value inside the quote. */
  evidenceOk: z.boolean(),
  /** A person's correction, read in place of the value wherever both exist. */
  humanValue: z.string().nullable(),
  note: z.string().nullable(),
});
export type ExtractedFieldView = z.infer<typeof ExtractedFieldView>;

/** One document's extraction: which file, which place it filled, and its seven fields. */
export const ExtractionView = z.object({
  filename: z.string(),
  role: z.enum(["SI", "BL"]),
  /** Whether the verifier ran on this document. */
  verified: z.boolean(),
  promptVersion: z.string(),
  model: z.string(),
  fields: z.array(ExtractedFieldView),
});
export type ExtractionView = z.infer<typeof ExtractionView>;

/** The judge's word on one field: the two values it saw and whether they denote the same thing. */
export const FieldJudgementView = z.object({
  field: ComparisonField,
  siValue: z.string().nullable(),
  blValue: z.string().nullable(),
  same: z.boolean(),
  /** Either side blank, a placeholder, or never located: uncertainty, never a difference. */
  missing: z.boolean(),
  confidence: z.number().nullable(),
  rationale: z.string().nullable(),
});
export type FieldJudgementView = z.infer<typeof FieldJudgementView>;

/** How the pair came out: the organisers' status and reason, the differing fields, and every field's judgement. */
export const ComparisonView = z.object({
  status: ComparisonStatus,
  reviewReason: ReviewReason.nullable(),
  defectFields: z.array(ComparisonField),
  fields: z.array(FieldJudgementView),
  detail: z.record(z.string(), z.unknown()),
});
export type ComparisonView = z.infer<typeof ComparisonView>;

/** A run's compared pairs: how many came out clean or with a defect, and which fields differed how often. */
export const RunOutcomes = z.object({
  ok: z.number(),
  mismatch: z.number(),
  byField: z.record(ComparisonField, z.number()),
});
export type RunOutcomes = z.infer<typeof RunOutcomes>;
