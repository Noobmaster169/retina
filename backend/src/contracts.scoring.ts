/**
 * What is scored and how. Re-exported from contracts.ts, which is what
 * everything imports.
 */
import { z } from "zod";

// The organisers' enums and shapes, value for value, from emails/data_v2/README.md
// and emails/server/scoring.py. Field names stay snake_case: this is their JSON,
// in and out. The database check constraints repeat these lists.

export const Category = z.enum(["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]);
export type Category = z.infer<typeof Category>;

export const ComparisonStatus = z.enum(["OK", "MISMATCH", "NEEDS_REVIEW"]);
export type ComparisonStatus = z.infer<typeof ComparisonStatus>;

/** Why a comparison needs a human. Exactly the organisers' four: nothing else is stored or submitted. */
export const ReviewReason = z.enum(["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]);
export type ReviewReason = z.infer<typeof ReviewReason>;

/** The seven fields an SI and a BL are compared on. */
export const ComparisonField = z.enum([
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
]);
export type ComparisonField = z.infer<typeof ComparisonField>;

export const TruthRow = z.object({
  category: Category,
  status: ComparisonStatus,
  review_reason: ReviewReason.nullable(),
  has_defect: z.boolean(),
  defect_fields: z.array(ComparisonField),
});
export type TruthRow = z.infer<typeof TruthRow>;

export const SubmissionRow = z.object({
  category: Category,
  status: ComparisonStatus,
  review_reason: ReviewReason.nullable(),
  has_defect: z.boolean(),
  defect_fields: z.array(ComparisonField),
  /** Not scored. The scorer reports the rule-decided share as a cost diagnostic. */
  decided_by: z.enum(["rule", "llm"]),
});
export type SubmissionRow = z.infer<typeof SubmissionRow>;

const Prf = z.object({ tp: z.number(), fp: z.number(), fn: z.number() });

export const Scoreboard = z.object({
  stage1: z.object({
    accuracy: z.number(),
    macro_f1: z.number(),
    rule_pct: z.number().nullable(),
    per: z.record(z.string(), Prf),
    confusion: z.record(z.string(), z.record(z.string(), z.number())),
  }),
  stage3: z.object({
    defect_precision: z.number(),
    defect_recall: z.number(),
    defect_f1: z.number(),
    field_f1: z.number(),
    exact_match_rate: z.number(),
    doc_total: z.number(),
  }),
  reliability: z.object({
    escalation_recall: z.number(),
    escalation_precision: z.number(),
    escalation_f1: z.number(),
    gold_review: z.number(),
    pred_review: z.number(),
    per_reason: z.record(z.string(), z.object({ total: z.number(), caught: z.number() })),
  }),
  end_to_end: z.object({ success: z.number(), total: z.number(), rate: z.number() }),
  weights: z.object({ stage1: z.number(), stage3: z.number(), end_to_end: z.number() }),
  final_score: z.number(),
  n_emails: z.number(),
});
export type Scoreboard = z.infer<typeof Scoreboard>;

// Submitting a run and reading its score.

export const SubmissionSummary = z.object({
  id: z.string(),
  finalScore: z.number().nullable(),
  nEmails: z.number(),
  forced: z.boolean(),
  createdAt: z.string(),
  scoreboard: Scoreboard.nullable(),
});
export type SubmissionSummary = z.infer<typeof SubmissionSummary>;

export const SubmitResult = z.object({ submissionId: z.string(), finalScore: z.number(), scoreboard: Scoreboard });
export type SubmitResult = z.infer<typeof SubmitResult>;

/** 409: the run has emails the pipeline has not finished with. `?force=true` submits anyway. */
export const SubmitRefused = z.object({ error: z.string(), incomplete: z.array(z.string()) });
export type SubmitRefused = z.infer<typeof SubmitRefused>;

/** Dev only: scored here against the answer key. `run` is the scoreboard over just the emails this run holds. */
export const EvalReport = z.object({
  full: Scoreboard,
  holdout: Scoreboard,
  run: Scoreboard,
  wrong: z.object({ stage1: z.array(z.string()), stage3: z.array(z.string()), e2e: z.array(z.string()) }),
});
export type EvalReport = z.infer<typeof EvalReport>;
