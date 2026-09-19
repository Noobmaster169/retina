import type { ComparisonStatus, ReviewReason } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewComparison {
  emailRunId: string;
  status: ComparisonStatus;
  /** Set exactly when the status is NEEDS_REVIEW. The table refuses anything else. */
  reviewReason: ReviewReason | null;
  detail: Record<string, unknown>;
}

/** One row per email run; re-running the stage replaces it. `has_defect` follows the status, as the organisers define it. */
export async function upsert(db: Queryable, row: NewComparison): Promise<void> {
  await db.query(
    `insert into core.comparisons (email_run_id, status, review_reason, has_defect, detail)
     values ($1, $2, $3, $2 = 'MISMATCH', $4)
     on conflict (email_run_id) do update set
       status = excluded.status,
       review_reason = excluded.review_reason,
       has_defect = excluded.has_defect,
       detail = excluded.detail,
       created_at = now()`,
    [row.emailRunId, row.status, row.reviewReason, JSON.stringify(row.detail)],
  );
}
