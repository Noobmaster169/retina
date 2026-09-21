import { PromptSet, type RunStatus } from "../../contracts";
import type { Queryable } from "../../db";

export interface Run {
  id: string;
  /** What a person called it. Null until one does; the page names an unnamed run by when it started. */
  name: string | null;
  source: string;
  ratePerSecond: number;
  emailLimit: number | null;
  emailIds: string[] | null;
  status: RunStatus;
  totalEmails: number | null;
  /** Which ingest job owns the run. Every resume raises it. */
  ingestEpoch: number;
  /** The prompt version and model of every LLM step, fixed when the run was created. */
  promptSet: PromptSet;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NewRun {
  id: string;
  source: string;
  ratePerSecond: number;
  emailLimit?: number;
  emailIds?: string[];
  promptSet?: PromptSet;
  createdBy?: string;
}

interface RunRow {
  id: string;
  name: string | null;
  source: string;
  rate_per_second: string;
  email_limit: number | null;
  email_ids: string[] | null;
  status: RunStatus;
  total_emails: number | null;
  ingest_epoch: number;
  prompt_set: unknown;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const COLUMNS = `id, name, source, rate_per_second, email_limit, email_ids, status, total_emails,
  ingest_epoch, prompt_set, created_by, created_at, started_at, finished_at`;

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    ratePerSecond: Number(row.rate_per_second),
    emailLimit: row.email_limit,
    emailIds: row.email_ids,
    status: row.status,
    totalEmails: row.total_emails,
    ingestEpoch: row.ingest_epoch,
    promptSet: PromptSet.parse(row.prompt_set),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

export async function create(db: Queryable, run: NewRun): Promise<Run> {
  const { rows } = await db.query<RunRow>(
    `insert into core.runs (id, source, rate_per_second, email_limit, email_ids, status, prompt_set, created_by)
     values ($1, $2, $3, $4, $5, 'created', $6, $7)
     returning ${COLUMNS}`,
    [
      run.id,
      run.source,
      run.ratePerSecond,
      run.emailLimit ?? null,
      run.emailIds ?? null,
      JSON.stringify(run.promptSet ?? {}),
      run.createdBy ?? null,
    ],
  );
  return toRun(rows[0]);
}

export async function get(db: Queryable, id: string): Promise<Run | null> {
  const { rows } = await db.query<RunRow>(`select ${COLUMNS} from core.runs where id = $1`, [id]);
  return rows[0] ? toRun(rows[0]) : null;
}

export async function list(db: Queryable, limit = 50): Promise<Run[]> {
  const { rows } = await db.query<RunRow>(`select ${COLUMNS} from core.runs order by created_at desc limit $1`, [limit]);
  return rows.map(toRun);
}

export async function status(db: Queryable, id: string): Promise<RunStatus | null> {
  const { rows } = await db.query<{ status: RunStatus }>("select status from core.runs where id = $1", [id]);
  return rows[0]?.status ?? null;
}

/**
 * Which of these runs are paused, in one read. The pause gate asks about every
 * run it is holding work for, once a second, so this has to be one query and
 * not one per job in flight.
 */
export async function pausedAmong(db: Queryable, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ id: string }>(
    "select id from core.runs where id = any($1) and status = 'paused'",
    [ids],
  );
  return new Set(rows.map((row) => row.id));
}

export interface IngestState {
  status: RunStatus;
  ingestEpoch: number;
}

/** What the ingest loop checks before every email. */
export async function ingestState(db: Queryable, id: string): Promise<IngestState | null> {
  const { rows } = await db.query<{ status: RunStatus; ingest_epoch: number }>(
    "select status, ingest_epoch from core.runs where id = $1",
    [id],
  );
  return rows[0] ? { status: rows[0].status, ingestEpoch: rows[0].ingest_epoch } : null;
}

/**
 * Moves a paused run back to `running` under a new epoch, which retires any
 * ingest job still holding the old one. Returns the new epoch, or null when
 * the run was not paused.
 */
export async function resume(db: Queryable, id: string): Promise<number | null> {
  const { rows } = await db.query<{ ingest_epoch: number }>(
    `update core.runs
        set status = 'running', ingest_epoch = ingest_epoch + 1, finished_at = null
      where id = $1 and status = 'paused'
      returning ingest_epoch`,
    [id],
  );
  return rows[0]?.ingest_epoch ?? null;
}

/**
 * Records the size of the run and moves it to `running`, unless someone
 * paused or cancelled it before the controller got here. Returns the status
 * the run is in afterwards.
 */
export async function markStarted(db: Queryable, id: string, totalEmails: number): Promise<RunStatus | null> {
  const { rows } = await db.query<{ status: RunStatus }>(
    `update core.runs
        set status = case when status in ('created', 'running') then 'running' else status end,
            total_emails = $2,
            started_at = coalesce(started_at, now())
      where id = $1
      returning status`,
    [id, totalEmails],
  );
  return rows[0]?.status ?? null;
}

/**
 * What a person calls this run. An empty name is how they take one back, and
 * the run is shown by when it started again. Null when there is no such run.
 */
export async function rename(db: Queryable, id: string, name: string): Promise<Run | null> {
  const { rows } = await db.query<RunRow>(
    `update core.runs set name = $2 where id = $1 returning ${COLUMNS}`,
    [id, name.length > 0 ? name : null],
  );
  return rows[0] ? toRun(rows[0]) : null;
}

/** Moves a run to `to` only from one of `from`. False when it was somewhere else. */
export async function setStatus(db: Queryable, id: string, to: RunStatus, from: RunStatus[]): Promise<boolean> {
  const { rowCount } = await db.query(
    `update core.runs
        set status = $2,
            finished_at = case when $2 in ('completed', 'cancelled', 'failed') then now() else null end
      where id = $1 and status = any($3)`,
    [id, to, from],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Drops a run and everything hanging off it. Every table that references
 * `core.runs` does so `on delete cascade`, so this one statement takes the
 * email runs, classifications, comparisons, documents, extractions, review
 * cases, attachments, llm calls and submissions with it.
 *
 * Refuses a run that is still running: its workers hold jobs that would then
 * fail on a run that no longer exists, and a person who wants it gone can
 * cancel it first and see that happen. False when there was no such run, or
 * when it is running.
 */
export async function remove(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query("delete from core.runs where id = $1 and status <> 'running'", [id]);
  return rowCount === 1;
}
