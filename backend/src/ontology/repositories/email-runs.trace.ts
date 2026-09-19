import type { Stage } from "../../contracts";
import type { Queryable } from "../../db";

/** Reading a run's emails back for the run page: one email's state, and which are working now. */

export interface EmailRunState {
  id: string;
  stage: Stage;
  error: string | null;
}

export async function stateOf(db: Queryable, runId: string, emailId: string): Promise<EmailRunState | null> {
  const { rows } = await db.query<EmailRunState>(
    "select id, stage, error from core.email_runs where run_id = $1 and email_id = $2",
    [runId, emailId],
  );
  return rows[0] ?? null;
}

/** The run's emails a model call may be running for right now. */
export async function inFlight(db: Queryable, runId: string): Promise<{ id: string; emailId: string }[]> {
  const { rows } = await db.query<{ id: string; email_id: string }>(
    `select id, email_id from core.email_runs
      where run_id = $1 and stage in ('classifying', 'comparing')
      order by email_id`,
    [runId],
  );
  return rows.map((row) => ({ id: row.id, emailId: row.email_id }));
}

/** When each run's last email finished, as a total lookup: null for a run with none finished. */
export async function lastFinishedForRuns(db: Queryable, runIds: string[]): Promise<(runId: string) => string | null> {
  if (runIds.length === 0) return () => null;
  const { rows } = await db.query<{ run_id: string; last: Date }>(
    `select run_id, max(finished_at) as last from core.email_runs
      where run_id = any($1::uuid[]) and finished_at is not null group by run_id`,
    [runIds],
  );
  const last = new Map(rows.map((row) => [row.run_id, row.last.toISOString()]));
  return (runId) => last.get(runId) ?? null;
}
