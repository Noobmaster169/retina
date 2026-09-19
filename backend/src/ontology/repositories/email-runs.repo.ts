import { type Category, type ComparisonStatus, type ReviewReason, Stage } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewEmailRun {
  runId: string;
  emailId: string;
  stage: Stage;
  priority: number;
}

export interface StageChange {
  outcome?: string;
  error?: string;
  /** Stamps finished_at. Set on the stages an email does not leave: done and failed. */
  finished?: boolean;
}

export type StageCounts = Record<Stage, number>;

function emptyCounts(): StageCounts {
  return Object.fromEntries(Stage.options.map((stage) => [stage, 0])) as StageCounts;
}

/** False when the row was already there: the (run, email) pair is unique. */
export async function insert(db: Queryable, row: NewEmailRun): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into core.email_runs (run_id, email_id, stage, priority)
     values ($1, $2, $3, $4)
     on conflict (run_id, email_id) do nothing`,
    [row.runId, row.emailId, row.stage, row.priority],
  );
  return (rowCount ?? 0) > 0;
}

export async function exists(db: Queryable, runId: string, emailId: string): Promise<boolean> {
  const { rowCount } = await db.query("select 1 from core.email_runs where run_id = $1 and email_id = $2", [
    runId,
    emailId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function emailIdsForRun(db: Queryable, runId: string, stage?: Stage): Promise<string[]> {
  const { rows } = await db.query<{ email_id: string }>(
    `select email_id from core.email_runs
      where run_id = $1 and ($2::text is null or stage = $2)
      order by email_id`,
    [runId, stage ?? null],
  );
  return rows.map((row) => row.email_id);
}

export async function setStage(
  db: Queryable,
  runId: string,
  emailId: string,
  stage: Stage,
  change: StageChange = {},
): Promise<void> {
  await db.query(
    `update core.email_runs
        set stage = $3,
            outcome = coalesce($4, outcome),
            error = $5,
            finished_at = case when $6 then now() else null end
      where run_id = $1 and email_id = $2`,
    [runId, emailId, stage, change.outcome ?? null, change.error ?? null, change.finished ?? false],
  );
}

/**
 * Moves the email to `to` only from one of `from`. False when it was somewhere
 * else, which is how a job that runs twice (a retry, a stalled job reclaimed
 * while the first copy finishes) is kept from dragging a finished email backwards.
 */
export async function moveStage(
  db: Queryable,
  runId: string,
  emailId: string,
  from: Stage[],
  to: Stage,
  change: StageChange = {},
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update core.email_runs
        set stage = $3,
            outcome = coalesce($4, outcome),
            error = $5,
            finished_at = case when $6 then now() else null end
      where run_id = $1 and email_id = $2 and stage = any($7)`,
    [runId, emailId, to, change.outcome ?? null, change.error ?? null, change.finished ?? false, from],
  );
  return (rowCount ?? 0) > 0;
}

export async function incrementAttempt(db: Queryable, runId: string, emailId: string): Promise<void> {
  await db.query("update core.email_runs set attempt = attempt + 1 where run_id = $1 and email_id = $2", [
    runId,
    emailId,
  ]);
}

/**
 * Counts for many runs at once, as a total lookup: every stage is present for
 * every run, zero where no email is there. Returning a function rather than a
 * Map keeps the "always present" guarantee inside the repository that makes it,
 * so a caller has nothing to default and no absent case to invent.
 */
export async function stageCountsForRuns(db: Queryable, runIds: string[]): Promise<(runId: string) => StageCounts> {
  const counts = new Map(runIds.map((id) => [id, emptyCounts()]));
  if (runIds.length === 0) return () => emptyCounts();

  const { rows } = await db.query<{ run_id: string; stage: Stage; n: string }>(
    `select run_id, stage, count(*) as n from core.email_runs
      where run_id = any($1::uuid[]) group by run_id, stage`,
    [runIds],
  );
  for (const row of rows) {
    const forRun = counts.get(row.run_id);
    if (forRun) forRun[row.stage] = Number(row.n);
  }
  return (runId) => counts.get(runId) ?? emptyCounts();
}

export async function stageCounts(db: Queryable, runId: string): Promise<StageCounts> {
  return (await stageCountsForRuns(db, [runId]))(runId);
}

/** The row id that classifications, comparisons and the LLM ledger hang off. */
export async function idOf(db: Queryable, runId: string, emailId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    "select id from core.email_runs where run_id = $1 and email_id = $2",
    [runId, emailId],
  );
  return rows[0]?.id ?? null;
}

/** Everything the scorer's payload is built from, one row per email of the run. */
export interface SubmissionSource {
  emailId: string;
  stage: Stage;
  finalCategory: Category | null;
  humanCategory: Category | null;
  status: ComparisonStatus | null;
  reviewReason: ReviewReason | null;
}

export async function listForSubmission(db: Queryable, runId: string): Promise<SubmissionSource[]> {
  const { rows } = await db.query<{
    email_id: string;
    stage: Stage;
    final_category: Category | null;
    human_category: Category | null;
    status: ComparisonStatus | null;
    review_reason: ReviewReason | null;
  }>(
    `select er.email_id, er.stage, c.final_category, c.human_category, cmp.status, cmp.review_reason
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
  }));
}
