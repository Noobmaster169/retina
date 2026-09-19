import { type ReviewCaseView, ReviewReason, type RunReview } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewReviewCase {
  emailRunId: string;
  reason: ReviewReason;
  /** The pipeline stage that raised it. */
  stage: string;
  detail: Record<string, unknown>;
}

interface CaseRow {
  reason: ReviewReason;
  stage: string;
  status: "open" | "resolved";
  detail: Record<string, unknown>;
  opened_at: Date;
}

function toView(row: CaseRow): ReviewCaseView {
  return { reason: row.reason, stage: row.stage, status: row.status, detail: row.detail, openedAt: row.opened_at.toISOString() };
}

/**
 * Opens a case unless the email run already has one open, in which case that
 * one stands and this changes nothing: a stage that runs twice raises once.
 * Returns whether a case was opened.
 */
export async function open(db: Queryable, row: NewReviewCase): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into core.review_cases (email_run_id, kind, reason, stage, detail)
     select $1, 'review', $2, $3, $4
      where not exists (select 1 from core.review_cases where email_run_id = $1 and status = 'open')`,
    [row.emailRunId, row.reason, row.stage, JSON.stringify(row.detail)],
  );
  return (rowCount ?? 0) > 0;
}

/** The email run's open case, or its newest resolved one, or null. */
export async function latestFor(db: Queryable, emailRunId: string): Promise<ReviewCaseView | null> {
  const { rows } = await db.query<CaseRow>(
    `select reason, stage, status, detail, opened_at from core.review_cases
      where email_run_id = $1 and kind = 'review'
      order by (status = 'open') desc, opened_at desc limit 1`,
    [emailRunId],
  );
  return rows[0] ? toView(rows[0]) : null;
}

function noneOpen(): RunReview {
  return { open: 0, byReason: Object.fromEntries(ReviewReason.options.map((r) => [r, 0])) as RunReview["byReason"] };
}

/** Open cases per run and per reason, as a total lookup: every run and every reason answers, zero where none. */
export async function openCountsForRuns(db: Queryable, runIds: string[]): Promise<(runId: string) => RunReview> {
  const counts = new Map(runIds.map((id) => [id, noneOpen()]));
  if (runIds.length === 0) return () => noneOpen();
  const { rows } = await db.query<{ run_id: string; reason: ReviewReason; n: string }>(
    `select er.run_id, rc.reason, count(*) as n
       from core.review_cases rc join core.email_runs er on er.id = rc.email_run_id
      where er.run_id = any($1::uuid[]) and rc.status = 'open' and rc.kind = 'review'
      group by er.run_id, rc.reason`,
    [runIds],
  );
  for (const row of rows) {
    const forRun = counts.get(row.run_id);
    if (!forRun) continue;
    forRun.byReason[row.reason] = Number(row.n);
    forRun.open += Number(row.n);
  }
  return (runId) => counts.get(runId) ?? noneOpen();
}
