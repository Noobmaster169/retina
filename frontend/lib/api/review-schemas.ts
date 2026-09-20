import { z } from "zod";

import { ComparisonField, ReviewReason } from "./runs-schemas";
// Type only: trace-schemas mirrors the case itself and imports the action back.
import type { Category } from "./trace-schemas";

/**
 * The review inbox and every write a person makes against a case. Mirrored by
 * hand from backend/src/contracts.actions.ts; change both or neither.
 *
 * Nothing here names a correct value for a field. A correction records what a
 * person says one document reads, and the pair is judged again from both
 * sides: docs/05-design.md section 11.
 */

export const ReviewActionKind = z.enum(["confirm", "correct_field", "reclassify", "note", "upload", "retry", "reopen"]);
export type ReviewActionKind = z.infer<typeof ReviewActionKind>;

export const ExtractionSide = z.enum(["SI", "BL"]);
export type ExtractionSide = z.infer<typeof ExtractionSide>;

export const ReviewActionView = z.object({
  id: z.string(),
  kind: ReviewActionKind,
  field: ComparisonField.nullable(),
  side: ExtractionSide.nullable(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  note: z.string().nullable(),
  actor: z.string(),
  createdAt: z.string(),
});
export type ReviewActionView = z.infer<typeof ReviewActionView>;

/** Ours: a case raised by one of the organisers' four reasons, or by a job that failed for good. */
export const ReviewCaseKind = z.enum(["review", "failure"]);
export type ReviewCaseKind = z.infer<typeof ReviewCaseKind>;

export const ReviewCaseItem = z.object({
  id: z.string(),
  runId: z.string(),
  emailId: z.string(),
  subject: z.string(),
  from: z.string(),
  kind: ReviewCaseKind,
  /** Null exactly when the kind is `failure`. */
  reason: ReviewReason.nullable(),
  stage: z.string(),
  status: z.enum(["open", "resolved"]),
  /** An instant, so the row's age counts against the page's own clock between polls. */
  openedAt: z.string(),
  actions: z.number(),
  lastActionAt: z.string().nullable(),
  lastActionBy: z.string().nullable(),
});
export type ReviewCaseItem = z.infer<typeof ReviewCaseItem>;

export const ReviewQueue = z.object({
  cases: z.array(ReviewCaseItem),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ReviewQueue = z.infer<typeof ReviewQueue>;

export const ReviewStats = z.object({
  open: z.number(),
  byReason: z.record(ReviewReason, z.number()),
  failures: z.number(),
  resolvedToday: z.number(),
  medianResolveMs: z.number().nullable(),
});
export type ReviewStats = z.infer<typeof ReviewStats>;

export const ReviewActionResult = z.object({
  case: ReviewCaseItem,
  action: ReviewActionView,
  /** The queue a rerun went to, or null where the action changed nothing outside the database. */
  requeued: z.enum(["classify", "compare"]).nullable(),
  /** One sentence in the product's own voice, written by the api. The toast shows it verbatim. */
  wrote: z.string(),
});
export type ReviewActionResult = z.infer<typeof ReviewActionResult>;

/** What a page sends. The api validates it again per kind, which is where the refusals come from. */
export type ReviewActionInput =
  | { kind: "confirm"; actor: string; note?: string }
  | { kind: "correct_field"; actor: string; field: ComparisonField; side: ExtractionSide; value: string; note?: string }
  | { kind: "reclassify"; actor: string; category: Category; note?: string }
  | { kind: "note"; actor: string; note: string }
  | { kind: "retry"; actor: string; note?: string }
  | { kind: "reopen"; actor: string; note: string };
