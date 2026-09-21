import { z } from "zod";

import { ReviewActionView, ReviewCaseKind } from "./contracts.actions";
import { ReviewReason } from "./contracts.scoring";

/**
 * What the compare stage knows about an email's documents and whether it
 * needs a person. Re-exported from contracts.ts; mirrored in
 * frontend/lib/api/trace-schemas.ts and runs-schemas.ts.
 */

/** Ours, not an organiser enum: what the model says a document is. */
export const DocType = z.enum(["SI", "BL", "INVOICE", "PACKING_LIST", "COO", "OTHER"]);
export type DocType = z.infer<typeof DocType>;

export const DocumentFormat = z.enum(["txt", "pdf", "docx", "xlsx", "image", "unknown"]);
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

/** How an email ended: never sent to compare, compared clean or with a defect, or parked with one of the organisers' reasons. */
export const Outcome = z.enum(["not_comparable", "OK", "MISMATCH", ...ReviewReason.options]);
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
  /**
   * Mean OCR word confidence per page, 0 to 100, in page order: tesseract's
   * own scale, as doc-extract reports it, and the same one the 40 percent
   * floor is written on. Empty for a document with a text layer, which is most
   * of them. The review case shows which page failed and how badly, and one
   * number for the whole file could not say that.
   */
  pageConfidence: z.array(z.number()),
  /** The file's size, which the message card states beside its name. */
  bytes: z.number(),
  /** `human` is a document a reviewer supplied for a case. It fills its place ahead of the sender's own. */
  origin: z.enum(["source", "human"]),
});
export type DocumentView = z.infer<typeof DocumentView>;

/**
 * Why the email is waiting for a person, with what the stage found and what
 * has been done about it. `id` is what the action routes are addressed by, so
 * the case pane can write without asking a second question first.
 */
export const ReviewCaseView = z.object({
  id: z.string(),
  kind: ReviewCaseKind,
  /** Null exactly when the kind is `failure`: a job that failed is not one of the organisers' reasons. */
  reason: ReviewReason.nullable(),
  stage: z.string(),
  status: z.enum(["open", "resolved"]),
  detail: z.record(z.string(), z.unknown()),
  openedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  /** Oldest first, as a history reads. */
  actions: z.array(ReviewActionView),
});
export type ReviewCaseView = z.infer<typeof ReviewCaseView>;

/** A run's open review cases, in total and per reason. Every reason is present, zero where none. */
export const RunReview = z.object({
  open: z.number(),
  byReason: z.record(ReviewReason, z.number()),
});
export type RunReview = z.infer<typeof RunReview>;
