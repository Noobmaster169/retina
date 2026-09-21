/**
 * What is scored and how. Re-exported from contracts.ts, which is what
 * everything imports.
 */
import { z } from "zod";

import { DecidedBy } from "./contracts.enums";

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

/** 409: the run has not finished ingesting, or holds emails the pipeline has not finished with (`?force=true` submits anyway), or is being scored right now. */
/** `forcible` says whether `?force=true` would get past this refusal; a submission already being scored would not. */
export const SubmitRefused = z.object({
  error: z.string(),
  incomplete: z.array(z.string()),
  forcible: z.boolean(),
});
export type SubmitRefused = z.infer<typeof SubmitRefused>;

const Answer = SubmissionRow.omit({ decided_by: true });

/**
 * Ours, not an organiser enum: what the verifier did to the generator's
 * answer, judged against the truth. `not_run` is the generator being sure
 * enough that no second call was made.
 */
export const VerifierEffect = z.enum([
  "not_run",
  "fixed",
  "broke",
  "agreed_right",
  "agreed_wrong",
  "changed_still_wrong",
]);
export type VerifierEffect = z.infer<typeof VerifierEffect>;

/**
 * How the two readers settled this email, beside the verdict on their answer.
 * Only what a row can show without opening the email: the rationales and the
 * counter-cases are in the trace, one call away.
 */
export const ClassifyChain = z.object({
  genCategory: Category,
  genConfidence: z.number(),
  /** Null when the generator's confidence was above the threshold and the verifier did not run. */
  verCategory: Category.nullable(),
  verConfidence: z.number().nullable(),
  decidedBy: DecidedBy,
  /** A reviewer's category, where one was recorded. It settles the submitted answer, never the effect. */
  humanCategory: Category.nullable(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
});
export type ClassifyChain = z.infer<typeof ClassifyChain>;

export const VerdictClassify = ClassifyChain.extend({ effect: VerifierEffect });
export type VerdictClassify = z.infer<typeof VerdictClassify>;

/**
 * One email, the submission against the truth, check by check on the scorer's
 * definitions. A check is null where the scorer does not score it for this email.
 */
export const EmailVerdict = z.object({
  emailId: z.string(),
  inHoldout: z.boolean(),
  /** False when the run holds no answer for it: it counts as GENERAL, the scorer's default. */
  submitted: z.boolean(),
  answer: Answer,
  truth: Answer,
  checks: z.object({
    category: z.boolean(),
    status: z.boolean().nullable(),
    reviewReason: z.boolean().nullable(),
    defect: z.boolean().nullable(),
    defectFields: z.boolean().nullable(),
    endToEnd: z.boolean().nullable(),
  }),
  /** Null when the email was never classified: an ingest that failed, or a run stopped before it. */
  classify: VerdictClassify.nullable(),
});
export type EmailVerdict = z.infer<typeof EmailVerdict>;

/** Dev only: scored here against the answer key. `run` is the scoreboard over just the emails this run holds. */
export const EvalReport = z.object({
  full: Scoreboard,
  holdout: Scoreboard,
  run: Scoreboard,
  wrong: z.object({ stage1: z.array(z.string()), stage3: z.array(z.string()), e2e: z.array(z.string()) }),
  /** Every email of the run, its answer beside the truth. */
  emails: z.array(EmailVerdict),
});
export type EvalReport = z.infer<typeof EvalReport>;
