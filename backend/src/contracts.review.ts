import { z } from "zod";

import { ReviewReason } from "./contracts.scoring";

/**
 * What the compare stage knows about an email's documents and whether it
 * needs a person. Re-exported from contracts.ts; mirrored in
 * frontend/lib/api/trace-schemas.ts and runs-schemas.ts.
 */

/** Ours, not an organiser enum: what the model says a document is. */
export const DocType = z.enum(["SI", "BL", "INVOICE", "PACKING_LIST", "COO", "OTHER"]);
export type DocType = z.infer<typeof DocType>;

export const DocumentFormat = z.enum(["txt", "pdf", "docx", "xlsx", "unknown"]);
export type DocumentFormat = z.infer<typeof DocumentFormat>;

/**
 * How a document's reading stands against the place its file name claims.
 * `ok` means nothing stands against it, which includes a reading too unsure to
 * act on; `crossed` is a pair the model read the other way round and the check
 * put back; `wrong_type` is the one that escalates. Decided in
 * pipeline/compare/structure.ts so a page cannot invent a second rule.
 */
export const TypeVerdict = z.enum(["unknown", "ok", "crossed", "wrong_type"]);
export type TypeVerdict = z.infer<typeof TypeVerdict>;

/** How an email ended: never sent to compare, compared, or parked with one of the organisers' reasons. */
export const Outcome = z.enum(["not_comparable", "OK", ...ReviewReason.options]);
export type Outcome = z.infer<typeof Outcome>;

/** One attachment of one email run, as the parser saw it and as the model typed it. */
export const DocumentView = z.object({
  filename: z.string(),
  /** What the filename claims. */
  role: z.enum(["SI", "BL", "UNKNOWN"]),
  /** What the model says, or null before it has read the text or when there was none. */
  docType: DocType.nullable(),
  docTypeConfidence: z.number().nullable(),
  docTypeRationale: z.string().nullable(),
  /** What the compare stage makes of that reading. The page shows it; it never works it out. */
  typeVerdict: TypeVerdict,
  format: DocumentFormat,
  pages: z.number(),
  scanned: z.boolean(),
  unreadable: z.boolean(),
  warnings: z.array(z.string()),
});
export type DocumentView = z.infer<typeof DocumentView>;

/** Why the email is waiting for a person, with what the stage found. */
export const ReviewCaseView = z.object({
  reason: ReviewReason,
  stage: z.string(),
  status: z.enum(["open", "resolved"]),
  detail: z.record(z.string(), z.unknown()),
  openedAt: z.string(),
});
export type ReviewCaseView = z.infer<typeof ReviewCaseView>;

/** A run's open review cases, in total and per reason. Every reason is present, zero where none. */
export const RunReview = z.object({
  open: z.number(),
  byReason: z.record(ReviewReason, z.number()),
});
export type RunReview = z.infer<typeof RunReview>;
