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

/**
 * The crossing between the two queues: how many of the run's sorted emails
 * need a document check, how many stopped at the first queue, and how many
 * crossed with nothing yet to check. Counted here because the run page draws
 * the handoff and CLAUDE.md keeps that arithmetic out of the frontend.
 *
 * `awaitingDraft` is the organisers' own class: a comparison request whose
 * draft has not been sent yet, which their generator makes 45 per cent of
 * (`BL_WITH_ATTACH`). It crosses into the second queue and ends there without
 * a pair, so a page that shows only `needCheck` and the checked pairs leaves
 * it unaccounted for.
 */
export async function handoff(
  db: Queryable,
  runId: string,
): Promise<{ needCheck: number; notComparable: number; awaitingDraft: number }> {
  const { rows } = await db.query<{ need_check: string; not_comparable: string; awaiting_draft: string }>(
    `select count(*) filter (where c.final_category = 'BL_COMPARISON') as need_check,
            count(*) filter (where er.outcome = 'not_comparable')      as not_comparable,
            count(*) filter (where er.outcome = 'awaiting_draft')      as awaiting_draft
       from core.email_runs er
       left join core.classifications c on c.email_run_id = er.id
      where er.run_id = $1`,
    [runId],
  );
  return {
    needCheck: Number(rows[0].need_check),
    notComparable: Number(rows[0].not_comparable),
    awaitingDraft: Number(rows[0].awaiting_draft),
  };
}
