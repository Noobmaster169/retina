import { z } from "zod";

import { Category, ComparisonField, ReviewReason } from "./contracts.scoring";

/**
 * What a person may do to a case, and what the review inbox shows them.
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/review-schemas.ts.
 *
 * Every action is also a labelled example: phase 11 reads `review_actions` to
 * draft lessons, and which step a correction teaches follows from its kind.
 * Nothing here names a correct value for a field, because the product never
 * arbitrates between two documents.
 */

export const ReviewActionKind = z.enum(["confirm", "correct_field", "reclassify", "note", "upload", "retry", "reopen"]);
export type ReviewActionKind = z.infer<typeof ReviewActionKind>;

export const ExtractionSide = z.enum(["SI", "BL"]);
export type ExtractionSide = z.infer<typeof ExtractionSide>;

/** Who did it. There are no accounts in this build, so the UI types a name once and keeps it. */
const Actor = z.string().trim().min(1).max(64);
const Note = z.string().trim().min(1).max(2000);

/**
 * One action's body, validated per kind. A discriminated union rather than a
 * bag of optionals: a `correct_field` without a field is a 400 naming the
 * field, not a row with three nulls in it.
 */
export const ReviewActionBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("confirm"), actor: Actor, note: Note.optional() }),
  z.object({
    kind: z.literal("correct_field"),
    actor: Actor,
    field: ComparisonField,
    side: ExtractionSide,
    /** What the person says this document reads. Never "the correct value": it belongs to one side. */
    value: z.string().trim().min(1).max(500),
    note: Note.optional(),
  }),
  z.object({ kind: z.literal("reclassify"), actor: Actor, category: Category, note: Note.optional() }),
  z.object({ kind: z.literal("note"), actor: Actor, note: Note }),
  z.object({ kind: z.literal("retry"), actor: Actor, note: Note.optional() }),
  z.object({ kind: z.literal("reopen"), actor: Actor, note: Note }),
]);
export type ReviewActionBody = z.infer<typeof ReviewActionBody>;

/** The multipart fields beside an uploaded file. The file itself is checked by its own bytes. */
export const UploadBody = z.object({ actor: Actor, role: ExtractionSide, note: Note.optional() });
export type UploadBody = z.infer<typeof UploadBody>;

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

/** One row of the queue: enough to choose which case to open, and nothing more. */
export const ReviewCaseItem = z.object({
  id: z.string(),
  runId: z.string(),
  emailId: z.string(),
  subject: z.string(),
  from: z.string(),
  kind: ReviewCaseKind,
  /** Null exactly when the kind is `failure`: a failure is not one of the organisers' reasons. */
  reason: ReviewReason.nullable(),
  stage: z.string(),
  status: z.enum(["open", "resolved"]),
  /** An instant, so the page counts the age against its own clock between polls. */
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

export const ReviewQuery = z.object({
  status: z.enum(["open", "resolved", "all"]).default("open"),
  reason: ReviewReason.optional(),
  kind: ReviewCaseKind.optional(),
  runId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});
export type ReviewQuery = z.infer<typeof ReviewQuery>;

/** Open cases by reason, and what the queue has been getting through. */
export const ReviewStats = z.object({
  open: z.number(),
  byReason: z.record(ReviewReason, z.number()),
  failures: z.number(),
  resolvedToday: z.number(),
  /** Over the cases resolved in the last week. Null while none has been. */
  medianResolveMs: z.number().nullable(),
});
export type ReviewStats = z.infer<typeof ReviewStats>;

/** What an action changed, so the toast names what was written and what was re-queued. */
export const ReviewActionResult = z.object({
  case: ReviewCaseItem,
  action: ReviewActionView,
  /** The queue a rerun went to, or null when the action changed nothing outside the database. */
  requeued: z.enum(["classify", "compare"]).nullable(),
  /** One sentence in the product's own voice, written by the api because the frontend holds no logic. */
  wrote: z.string(),
});
export type ReviewActionResult = z.infer<typeof ReviewActionResult>;
