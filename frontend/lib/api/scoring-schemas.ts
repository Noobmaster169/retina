import { z } from "zod";

/**
 * Mirrors backend/src/contracts.scoring.ts; change both or neither. No transport
 * here, so a client component may import these.
 */

const Category = z.enum(["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]);
export const ComparisonStatus = z.enum(["OK", "MISMATCH", "NEEDS_REVIEW"]);
const ReviewReason = z.enum(["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]);

const Prf = z.object({ tp: z.number(), fp: z.number(), fn: z.number() });

/** What the organisers' scorer answers, and what the local eval computes the same way. */
export const Scoreboard = z.object({
  stage1: z.object({
    accuracy: z.number(),
    macro_f1: z.number(),
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

const Answer = z.object({
  category: Category,
  status: ComparisonStatus,
  review_reason: ReviewReason.nullable(),
  has_defect: z.boolean(),
  defect_fields: z.array(z.string()),
});
export type Answer = z.infer<typeof Answer>;

/** One email, the run's answer beside the truth, check by check. A null check is not scored for that email. */
export const EmailVerdict = z.object({
  emailId: z.string(),
  inHoldout: z.boolean(),
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
});
export type EmailVerdict = z.infer<typeof EmailVerdict>;

/** Dev only: the run scored against the answer key on the backend's disk. */
export const EvalReport = z.object({
  full: Scoreboard,
  holdout: Scoreboard,
  run: Scoreboard,
  wrong: z.object({ stage1: z.array(z.string()), stage3: z.array(z.string()), e2e: z.array(z.string()) }),
  emails: z.array(EmailVerdict),
});
export type EvalReport = z.infer<typeof EvalReport>;

export const SubmissionList = z.object({
  submissions: z.array(
    z.object({
      id: z.string(),
      finalScore: z.number().nullable(),
      nEmails: z.number(),
      forced: z.boolean(),
      createdAt: z.string(),
      scoreboard: Scoreboard.nullable(),
    }),
  ),
});
export type SubmissionList = z.infer<typeof SubmissionList>;
