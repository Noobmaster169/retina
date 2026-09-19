import { type Category, type ComparisonStatus, type ReviewReason, SubmissionRow } from "../contracts";
import type { Queryable } from "../db";
import { TerminalError } from "../lib/errors";

export interface BuiltSubmission {
  payload: Record<string, SubmissionRow>;
  /** Emails the pipeline has not finished with, or never classified. Submitting them scores its defaults, not its work. */
  incomplete: string[];
}

interface Row {
  email_id: string;
  stage: string;
  final_category: Category | null;
  human_category: Category | null;
  status: ComparisonStatus | null;
  review_reason: ReviewReason | null;
}

const SETTLED = new Set(["done", "review"]);

/**
 * The scorer's JSON for one run, derived from what the pipeline stored and
 * never written by hand. Every row is parsed against the organisers' enums on
 * the way out, so a value they did not define cannot be submitted.
 */
export async function buildSubmission(db: Queryable, runId: string): Promise<BuiltSubmission> {
  const { rows } = await db.query<Row>(
    `select er.email_id, er.stage, c.final_category, c.human_category, cmp.status, cmp.review_reason
       from core.email_runs er
       left join core.classifications c on c.email_run_id = er.id
       left join core.comparisons cmp on cmp.email_run_id = er.id
      where er.run_id = $1
      order by er.email_id`,
    [runId],
  );

  const payload: Record<string, SubmissionRow> = {};
  const incomplete: string[] = [];
  for (const row of rows) {
    const category = row.human_category ?? row.final_category;
    if (!category || !SETTLED.has(row.stage)) incomplete.push(row.email_id);

    const status = row.status ?? "OK";
    const parsed = SubmissionRow.safeParse({
      // An unclassified email is sent as the scorer's own default for a missing one.
      category: category ?? "GENERAL",
      status,
      review_reason: status === "NEEDS_REVIEW" ? row.review_reason : null,
      has_defect: status === "MISMATCH",
      // Phase 6 fills this from field_diffs. Until then nothing is compared, so nothing differs.
      defect_fields: [],
      decided_by: "llm",
    });
    if (!parsed.success) {
      throw new TerminalError(`email ${row.email_id} would submit a value outside the organisers' enums`, {
        cause: parsed.error,
      });
    }
    payload[row.email_id] = parsed.data;
  }
  return { payload, incomplete };
}
