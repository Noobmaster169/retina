import { type ReviewCaseKind, type ReviewCaseView, ReviewReason, type RunReview } from "../../contracts";
import type { Queryable } from "../../db";
import { listForCase } from "./review-actions.repo";

export interface NewReviewCase {
  emailRunId: string;
  reason: ReviewReason;
  /** The pipeline stage that raised it. */
  stage: string;
  detail: Record<string, unknown>;
}

export interface NewFailureCase {
  emailRunId: string;
  /** The queue whose job failed. */
  stage: string;
  detail: Record<string, unknown>;
}

interface CaseRow {
  id: string;
  kind: ReviewCaseKind;
  reason: ReviewReason | null;
  stage: string;
  status: "open" | "resolved";
  detail: Record<string, unknown>;
  opened_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
}

const COLUMNS = "id, kind, reason, stage, status, detail, opened_at, resolved_at, resolved_by";

async function toView(db: Queryable, row: CaseRow): Promise<ReviewCaseView> {
  return {
    id: row.id,
    kind: row.kind,
    reason: row.reason,
    stage: row.stage,
    status: row.status,
    detail: row.detail,
    openedAt: row.opened_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    resolvedBy: row.resolved_by,
    actions: await listForCase(db, row.id),
  };
}

/**
 * Raises the case, or updates the open one in place. One open case per email
 * run is a unique index, so a rerun that escalates again must change the
 * standing case rather than open a second: a person watching it sees the
 * reason change under them, which is what happened.
 */
export async function raise(db: Queryable, row: NewReviewCase): Promise<{ id: string; opened: boolean }> {
  const { rows } = await db.query<{ id: string; opened: boolean }>(
    `insert into core.review_cases (email_run_id, kind, reason, stage, detail)
     values ($1, 'review', $2, $3, $4)
     on conflict (email_run_id) where status = 'open'
     do update set kind = 'review', reason = excluded.reason, stage = excluded.stage, detail = excluded.detail
     returning id, (xmax = 0) as opened`,
    [row.emailRunId, row.reason, row.stage, JSON.stringify(row.detail)],
  );
  return rows[0];
}

/**
 * A job that failed for good. `kind = failure` carries no reason: a failure is
 * not one of the organisers' four, and the email is reported as incomplete
 * rather than escalated. An open review case becomes the failure, because the
 * failure is where the email now is and there may only be one open case.
 */
export async function openFailure(db: Queryable, row: NewFailureCase): Promise<{ id: string; opened: boolean }> {
  const { rows } = await db.query<{ id: string; opened: boolean }>(
    `insert into core.review_cases (email_run_id, kind, reason, stage, detail)
     values ($1, 'failure', null, $2, $3)
     on conflict (email_run_id) where status = 'open'
     do update set kind = 'failure', reason = null, stage = excluded.stage, detail = excluded.detail
     returning id, (xmax = 0) as opened`,
    [row.emailRunId, row.stage, JSON.stringify(row.detail)],
  );
  return rows[0];
}

/** The email run's open case, or null. What a stage that finished cleanly asks before closing one. */
export async function openIdFor(db: Queryable, emailRunId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    "select id from core.review_cases where email_run_id = $1 and status = 'open'",
    [emailRunId],
  );
  return rows[0]?.id ?? null;
}

/** Closes the email run's open case in the name of whoever asked for the work that settled it. Null when none was open. */
export async function resolve(db: Queryable, emailRunId: string, by: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `update core.review_cases set status = 'resolved', resolved_at = now(), resolved_by = $2
      where email_run_id = $1 and status = 'open' returning id`,
    [emailRunId, by],
  );
  return rows[0]?.id ?? null;
}

/** Puts a resolved case back. Refused while another case of the same email run is open. */
export async function reopen(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `update core.review_cases set status = 'open', resolved_at = null, resolved_by = null
      where id = $1 and status = 'resolved'`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export interface CaseIdentity {
  id: string;
  emailRunId: string;
  runId: string;
  emailId: string;
  kind: ReviewCaseKind;
  reason: ReviewReason | null;
  stage: string;
  status: "open" | "resolved";
}

/** The case and the email run it hangs off, which every action needs before it writes anything. */
export async function identify(db: Queryable, id: string): Promise<CaseIdentity | null> {
  const { rows } = await db.query<{
    id: string;
    email_run_id: string;
    run_id: string;
    email_id: string;
    kind: ReviewCaseKind;
    reason: ReviewReason | null;
    stage: string;
    status: "open" | "resolved";
  }>(
    `select rc.id, rc.email_run_id, er.run_id, er.email_id, rc.kind, rc.reason, rc.stage, rc.status
       from core.review_cases rc join core.email_runs er on er.id = rc.email_run_id
      where rc.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    emailRunId: row.email_run_id,
    runId: row.run_id,
    emailId: row.email_id,
    kind: row.kind,
    reason: row.reason,
    stage: row.stage,
    status: row.status,
  };
}

/** The email run's open case, or its newest resolved one, or null. */
export async function latestFor(db: Queryable, emailRunId: string): Promise<ReviewCaseView | null> {
  const { rows } = await db.query<CaseRow>(
    `select ${COLUMNS} from core.review_cases
      where email_run_id = $1
      order by (status = 'open') desc, opened_at desc limit 1`,
    [emailRunId],
  );
  return rows[0] ? toView(db, rows[0]) : null;
}

/** One case by id, with its history. */
export async function view(db: Queryable, id: string): Promise<ReviewCaseView | null> {
  const { rows } = await db.query<CaseRow>(`select ${COLUMNS} from core.review_cases where id = $1`, [id]);
  return rows[0] ? toView(db, rows[0]) : null;
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

export { item, list, stats } from "./review-cases.queue";
