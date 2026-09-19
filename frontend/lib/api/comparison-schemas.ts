import { z } from "zod";

import { ComparisonField, ReviewReason } from "./runs-schemas";
import { ComparisonStatus } from "./scoring-schemas";

/**
 * What the compare stage read from each document and how it judged the pair.
 * Mirrors backend/src/contracts.extraction.ts; change both or neither.
 */

/** One of the seven fields as the extractor read it from one document. */
export const ExtractedFieldView = z.object({
  field: ComparisonField,
  value: z.string().nullable(),
  placeholder: z.string().nullable(),
  sourceQuote: z.string().nullable(),
  confidence: z.number(),
  evidenceOk: z.boolean(),
  humanValue: z.string().nullable(),
  note: z.string().nullable(),
});
export type ExtractedFieldView = z.infer<typeof ExtractedFieldView>;

/** One document's extraction: which file, which place it filled, and its seven fields. */
export const ExtractionView = z.object({
  filename: z.string(),
  role: z.enum(["SI", "BL"]),
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
  missing: z.boolean(),
  confidence: z.number().nullable(),
  rationale: z.string().nullable(),
});
export type FieldJudgementView = z.infer<typeof FieldJudgementView>;

/** How the pair came out: status and reason, the differing fields, and every field's judgement. */
export const ComparisonView = z.object({
  status: ComparisonStatus,
  reviewReason: ReviewReason.nullable(),
  defectFields: z.array(ComparisonField),
  fields: z.array(FieldJudgementView),
  detail: z.record(z.string(), z.unknown()),
});
export type ComparisonView = z.infer<typeof ComparisonView>;
