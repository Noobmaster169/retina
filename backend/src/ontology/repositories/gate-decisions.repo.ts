import type { GateHeldRow, GateVerdict } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Every verdict the gate reached, admitted or held, in every mode.
 *
 * Append only. A release stamps the row rather than removing it, because the
 * question a person asks a week later is what happened, not what is currently
 * true. Each row carries the bucket readings it was decided on, so it can
 * justify itself long after those buckets have refilled.
 */

export interface NewDecision {
  runId: string | null;
  emailId: string;
  from: string;
  verdict: GateVerdict;
}

interface DecisionDbRow {
  id: string;
  run_id: string | null;
  email_id: string;
  from_addr: string;
  principal: string;
  scope: GateHeldRow["scope"];
  decision: GateHeldRow["decision"];
  reason: GateHeldRow["reason"];
  standing: GateHeldRow["standing"];
  units: number;
  breakdown: GateHeldRow["breakdown"];
  buckets: GateHeldRow["buckets"];
  enforced: boolean;
  decided_at: string;
  released_at: string | null;
}

function toRow(row: DecisionDbRow): GateHeldRow {
  return {
    id: String(row.id),
    runId: row.run_id,
    emailId: row.email_id,
    from: row.from_addr,
    principal: row.principal,
    scope: row.scope,
    decision: row.decision,
    reason: row.reason,
    standing: row.standing,
    units: Number(row.units),
    breakdown: row.breakdown,
    buckets: row.buckets,
    enforced: row.enforced,
    decidedAt: new Date(row.decided_at).toISOString(),
    releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
  };
}

const COLUMNS = `id, run_id, email_id, from_addr, principal, scope, decision, reason,
                 standing, units, breakdown, buckets, enforced, decided_at, released_at`;

export async function insert(db: Queryable, decision: NewDecision): Promise<string> {
  const { verdict } = decision;
  const { rows } = await db.query<{ id: string }>(
    `insert into core.gate_decisions
       (run_id, email_id, from_addr, principal, scope, decision, enforced, reason, standing, units, breakdown, buckets)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
     returning id`,
    [
      decision.runId,
      decision.emailId,
      decision.from,
      verdict.principal,
      verdict.scope,
      verdict.decision,
      verdict.enforced,
      verdict.reason,
      verdict.standing,
      verdict.units,
      JSON.stringify(verdict.breakdown),
      JSON.stringify(verdict.buckets),
    ],
  );
  return String(rows[0].id);
}

/** The holding pen: held for real, and nobody has released it. */
export async function waiting(db: Queryable, limit = 200): Promise<GateHeldRow[]> {
  const { rows } = await db.query<DecisionDbRow>(
    `select ${COLUMNS} from core.gate_decisions
      where decision = 'hold' and enforced and released_at is null
      order by decided_at desc limit $1`,
    [limit],
  );
  return rows.map(toRow);
}

/** The log the page draws as an activity feed. Everything, newest first. */
export async function recent(db: Queryable, limit = 100): Promise<GateHeldRow[]> {
  const { rows } = await db.query<DecisionDbRow>(
    `select ${COLUMNS} from core.gate_decisions order by decided_at desc limit $1`,
    [limit],
  );
  return rows.map(toRow);
}

export async function get(db: Queryable, id: string): Promise<GateHeldRow | null> {
  const { rows } = await db.query<DecisionDbRow>(`select ${COLUMNS} from core.gate_decisions where id = $1`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Stamps a hold as released. False where it was already released or is not a
 * hold, so a second click cannot enqueue a second copy of the same email.
 */
export async function release(db: Queryable, id: string, by: string): Promise<GateHeldRow | null> {
  const { rows } = await db.query<DecisionDbRow>(
    `update core.gate_decisions set released_by = $2, released_at = now()
      where id = $1 and decision = 'hold' and released_at is null
      returning ${COLUMNS}`,
    [id, by],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * How many of a run's emails the gate actually stopped.
 *
 * A held email has no core.email_runs row, deliberately: a new `stage` value
 * would break the run page of the image a failed deploy rolls back to. So the
 * run summary counts them here instead, and without this its finished count
 * could never reach its total and the page would spin forever.
 */
export async function heldByRun(db: Queryable, runIds: string[]): Promise<(runId: string) => number> {
  if (runIds.length === 0) return () => 0;
  const { rows } = await db.query<{ run_id: string; n: string }>(
    `select run_id, count(distinct email_id) as n from core.gate_decisions
      where run_id = any($1::uuid[]) and decision = 'hold' and enforced and released_at is null
      group by run_id`,
    [runIds],
  );
  const counts = new Map(rows.map((row) => [row.run_id, Number(row.n)]));
  return (runId) => counts.get(runId) ?? 0;
}

export interface DecisionTally {
  decisionsToday: number;
  heldToday: number;
  waiting: number;
}

/** The three numbers in the page's header, in one query. */
export async function tally(db: Queryable): Promise<DecisionTally> {
  const { rows } = await db.query<{ decisions_today: string; held_today: string; waiting: string }>(
    `select count(*) filter (where decided_at >= current_date) as decisions_today,
            count(*) filter (where decided_at >= current_date and decision = 'hold') as held_today,
            count(*) filter (where decision = 'hold' and enforced and released_at is null) as waiting
       from core.gate_decisions`,
  );
  const row = rows[0];
  return {
    decisionsToday: Number(row?.decisions_today ?? 0),
    heldToday: Number(row?.held_today ?? 0),
    waiting: Number(row?.waiting ?? 0),
  };
}
