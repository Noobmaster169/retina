import { ComparisonField, type ComparisonStatus, type ComparisonView, type ReviewReason, type RunOutcomes } from "../../contracts";
import type { Queryable } from "../../db";
import { listForComparison } from "./field-diffs.repo";

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

/** The comparison row's id, which the field judgements hang off. Null until the stage has written one. */
export async function idFor(db: Queryable, emailRunId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>("select id from core.comparisons where email_run_id = $1", [emailRunId]);
  return rows[0]?.id ?? null;
}

interface ComparisonRow {
  id: string;
  status: ComparisonStatus;
  review_reason: ReviewReason | null;
  detail: Record<string, unknown>;
}

/** How the pair came out, with every field's judgement, or null before the stage decided. */
export async function view(db: Queryable, emailRunId: string): Promise<ComparisonView | null> {
  const { rows } = await db.query<ComparisonRow>("select id, status, review_reason, detail from core.comparisons where email_run_id = $1", [emailRunId]);
  const row = rows[0];
  if (!row) return null;
  const fields = await listForComparison(db, row.id);
  return {
    status: row.status,
    reviewReason: row.review_reason,
    defectFields: fields.filter((f) => !f.same && !f.missing).map((f) => f.field),
    fields,
    detail: row.detail,
  };
}

function noOutcomes(): RunOutcomes {
  return { ok: 0, mismatch: 0, byField: Object.fromEntries(ComparisonField.options.map((f) => [f, 0])) as RunOutcomes["byField"] };
}

/** Per run, how the compared pairs came out and which fields differed, as a total lookup: zero where none. */
export async function outcomesForRuns(db: Queryable, runIds: string[]): Promise<(runId: string) => RunOutcomes> {
  const outcomes = new Map(runIds.map((id) => [id, noOutcomes()]));
  if (runIds.length === 0) return () => noOutcomes();
  const [statuses, fields] = await Promise.all([
    db.query<{ run_id: string; status: ComparisonStatus; n: string }>(
      `select er.run_id, c.status, count(*) as n
         from core.comparisons c join core.email_runs er on er.id = c.email_run_id
        where er.run_id = any($1::uuid[]) and c.status in ('OK', 'MISMATCH') and not (c.detail ? 'awaiting_draft')
        group by er.run_id, c.status`,
      [runIds],
    ),
    db.query<{ run_id: string; field: ComparisonField; n: string }>(
      `select er.run_id, fd.field, count(*) as n
         from core.field_diffs fd
         join core.comparisons c on c.id = fd.comparison_id
         join core.email_runs er on er.id = c.email_run_id
        where er.run_id = any($1::uuid[]) and c.status = 'MISMATCH' and not fd.same and not fd.missing
        group by er.run_id, fd.field`,
      [runIds],
    ),
  ]);
  for (const row of statuses.rows) {
    const forRun = outcomes.get(row.run_id);
    if (!forRun) continue;
    if (row.status === "OK") forRun.ok = Number(row.n);
    if (row.status === "MISMATCH") forRun.mismatch = Number(row.n);
  }
  for (const row of fields.rows) {
    const forRun = outcomes.get(row.run_id);
    if (forRun) forRun.byField[row.field] = Number(row.n);
  }
  return (runId) => outcomes.get(runId) ?? noOutcomes();
}

/**
 * Which layer settled this comparison. Ours, not the organisers': their
 * `decided_by` is `rule` or `llm` and the submission never carries this one.
 */
export async function setDecidedBy(db: Queryable, emailRunId: string, decidedBy: "llm" | "human"): Promise<void> {
  await db.query("update core.comparisons set decided_by = $2 where email_run_id = $1", [emailRunId, decidedBy]);
}
