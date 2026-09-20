import type { Category, ComparisonStatus, ReviewReason, Stage } from "../../contracts";
import type { Queryable } from "../../db";
import { DEFECT_FIELDS_SQL } from "./field-diffs.repo";

/**
 * A run's emails as the organisers' submission needs them: one row per email,
 * with the category, the verdict and the fields that differed already joined.
 *
 * Its own file beside email-runs.trace.ts, for the same reason: this is one
 * shape assembled for one consumer (ontology/submission.ts), not part of the
 * stage machine everything else in the aggregate is about.
 */

/** Everything the scorer's payload is built from, one row per email of the run. */
export interface SubmissionSource {
  emailId: string;
  stage: Stage;
  finalCategory: Category | null;
  humanCategory: Category | null;
  status: ComparisonStatus | null;
  reviewReason: ReviewReason | null;
  /** The fields the judge found different, in field-name order. Validated against the enum on the way out. */
  defectFields: string[];
}

export async function listForSubmission(db: Queryable, runId: string): Promise<SubmissionSource[]> {
  const { rows } = await db.query<{
    email_id: string;
    stage: Stage;
    final_category: Category | null;
    human_category: Category | null;
    status: ComparisonStatus | null;
    review_reason: ReviewReason | null;
    defect_fields: string[];
  }>(
    `select er.email_id, er.stage, c.final_category, c.human_category, cmp.status, cmp.review_reason,
            ${DEFECT_FIELDS_SQL} as defect_fields
       from core.email_runs er
       left join core.classifications c on c.email_run_id = er.id
       left join core.comparisons cmp on cmp.email_run_id = er.id
      where er.run_id = $1
      order by er.email_id`,
    [runId],
  );
  return rows.map((row) => ({
    emailId: row.email_id,
    stage: row.stage,
    finalCategory: row.final_category,
    humanCategory: row.human_category,
    status: row.status,
    reviewReason: row.review_reason,
    defectFields: row.defect_fields,
  }));
}
