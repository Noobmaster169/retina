import type { Scoreboard } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewSubmission {
  runId: string;
  payloadKey: string;
  nEmails: number;
  forced: boolean;
}

export interface StoredSubmission {
  id: string;
  runId: string;
  payloadKey: string;
  scoreboard: Scoreboard | null;
  finalScore: number | null;
  nEmails: number;
  forced: boolean;
  createdAt: string;
}

interface SubmissionDbRow {
  id: string;
  run_id: string;
  payload_key: string;
  scoreboard: Scoreboard | null;
  final_score: string | null;
  n_emails: number;
  forced: boolean;
  created_at: Date;
}

const COLUMNS = "id, run_id, payload_key, scoreboard, final_score, n_emails, forced, created_at";

function toSubmission(row: SubmissionDbRow): StoredSubmission {
  return {
    id: row.id,
    runId: row.run_id,
    payloadKey: row.payload_key,
    scoreboard: row.scoreboard,
    finalScore: row.final_score === null ? null : Number(row.final_score),
    nEmails: row.n_emails,
    forced: row.forced,
    createdAt: row.created_at.toISOString(),
  };
}

/** Recorded before the scorer is called, unscored, so a payload that was stored always has a row pointing at it. */
export async function insert(db: Queryable, submission: NewSubmission): Promise<StoredSubmission> {
  const { rows } = await db.query<SubmissionDbRow>(
    `insert into core.submissions (run_id, payload_key, n_emails, forced)
     values ($1, $2, $3, $4)
     returning ${COLUMNS}`,
    [submission.runId, submission.payloadKey, submission.nEmails, submission.forced],
  );
  return toSubmission(rows[0]);
}

export async function recordScore(db: Queryable, id: string, scoreboard: Scoreboard): Promise<void> {
  await db.query("update core.submissions set scoreboard = $2, final_score = $3 where id = $1", [
    id,
    JSON.stringify(scoreboard),
    scoreboard.final_score,
  ]);
}

export async function listForRun(db: Queryable, runId: string): Promise<StoredSubmission[]> {
  const { rows } = await db.query<SubmissionDbRow>(
    `select ${COLUMNS} from core.submissions where run_id = $1 order by created_at desc, id desc`,
    [runId],
  );
  return rows.map(toSubmission);
}

/** The newest scored submission of each run that has one. An attempt the scorer never answered does not hide an earlier score. */
export async function latestForRuns(db: Queryable, runIds: string[]): Promise<Map<string, StoredSubmission>> {
  if (runIds.length === 0) return new Map();
  const { rows } = await db.query<SubmissionDbRow>(
    `select distinct on (run_id) ${COLUMNS} from core.submissions
      where run_id = any($1::uuid[]) and scoreboard is not null
      order by run_id, created_at desc, id desc`,
    [runIds],
  );
  return new Map(rows.map((row) => [row.run_id, toSubmission(row)]));
}
