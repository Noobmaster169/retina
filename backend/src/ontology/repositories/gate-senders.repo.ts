import type { GatePolicy, GateScope } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * What a person decided about a sender, and what the sender's own record says.
 *
 * The record is counts and nothing else: how many emails on how many separate
 * days, and what they cost. No category, no status, no words from any email.
 * It is the memory the standing bracket in pipeline/gate/standing.ts is
 * computed from, and it is the only memory that bracket has.
 */

export interface SenderRecord {
  policy: GatePolicy;
  note: string | null;
  /** Distinct days at least one email arrived on. */
  daysSeen: number;
  /** Days since the first arrived, 0 where none has. */
  ageDays: number;
  firstSeen: string | null;
  lastSeen: string | null;
  unitsToday: number;
  emailsToday: number;
  heldToday: number;
  /** The last 14 daily totals, today excluded, oldest first, with the quiet days present as zeros. */
  recentDailyUnits: number[];
}

const EMPTY: SenderRecord = {
  policy: "auto",
  note: null,
  daysSeen: 0,
  ageDays: 0,
  firstSeen: null,
  lastSeen: null,
  unitsToday: 0,
  emailsToday: 0,
  heldToday: 0,
  recentDailyUnits: [],
};

interface RecordDbRow {
  principal: string;
  scope: GateScope;
  policy: GatePolicy | null;
  note: string | null;
  days_seen: string;
  first_day: string | null;
  last_day: string | null;
  units_today: string;
  emails_today: string;
  held_today: string;
  recent: number[] | null;
}

/**
 * Both scopes of one email in one round trip, because this runs on the enqueue
 * path once per email and two queries there would be two.
 *
 * The fortnight comes back as an array of totals rather than rows: the caller
 * wants a median, and a generated series fills the quiet days in SQL so the
 * pure function never has to guess which days are missing.
 */
export async function recordsFor(db: Queryable, principals: { principal: string; scope: GateScope }[]): Promise<Map<string, SenderRecord>> {
  if (principals.length === 0) return new Map();

  const { rows } = await db.query<RecordDbRow>(
    `with wanted as (
       select unnest($1::text[]) as principal, unnest($2::text[]) as scope
     )
     select w.principal, w.scope, p.policy, p.note,
            coalesce(a.days_seen, 0) as days_seen,
            a.first_day, a.last_day,
            coalesce(t.units, 0) as units_today,
            coalesce(t.emails, 0) as emails_today,
            coalesce(t.held, 0) as held_today,
            (select array_agg(coalesce(g.units, 0) order by g.day)
               from (
                 select d::date as day,
                        (select units from core.gate_activity
                          where principal = w.principal and scope = w.scope and day = d::date) as units
                   from generate_series(current_date - 14, current_date - 1, interval '1 day') d
               ) g) as recent
       from wanted w
       left join core.gate_policy p on p.principal = w.principal and p.scope = w.scope
       left join lateral (
         select count(*) as days_seen, min(day) as first_day, max(day) as last_day
           from core.gate_activity
          where principal = w.principal and scope = w.scope and emails > 0
       ) a on true
       left join core.gate_activity t
              on t.principal = w.principal and t.scope = w.scope and t.day = current_date`,
    [principals.map((one) => one.principal), principals.map((one) => one.scope)],
  );

  return new Map(rows.map((row) => [`${row.scope}:${row.principal}`, toRecord(row)]));
}

function toRecord(row: RecordDbRow): SenderRecord {
  const first = row.first_day ? new Date(row.first_day) : null;
  return {
    policy: row.policy ?? "auto",
    note: row.note,
    daysSeen: Number(row.days_seen),
    ageDays: first ? Math.max(0, Math.floor((Date.now() - first.getTime()) / 86_400_000)) : 0,
    firstSeen: row.first_day,
    lastSeen: row.last_day,
    unitsToday: Number(row.units_today),
    emailsToday: Number(row.emails_today),
    heldToday: Number(row.held_today),
    recentDailyUnits: (row.recent ?? []).map(Number),
  };
}

/** One principal's record, for a caller that only has one. */
export async function recordFor(db: Queryable, principal: string, scope: GateScope): Promise<SenderRecord> {
  const records = await recordsFor(db, [{ principal, scope }]);
  return records.get(`${scope}:${principal}`) ?? { ...EMPTY };
}

/** What a decision adds to the day's tally. Held emails are counted too: a hold is traffic that arrived. */
export async function recordArrival(
  db: Queryable,
  entries: { principal: string; scope: GateScope }[],
  units: number,
  held: boolean,
): Promise<void> {
  if (entries.length === 0) return;
  await db.query(
    `insert into core.gate_activity (principal, scope, day, emails, units, held)
     select unnest($1::text[]), unnest($2::text[]), current_date, 1, $3::int, $4::int
     on conflict (principal, scope, day) do update set
       emails = core.gate_activity.emails + 1,
       units  = core.gate_activity.units + $3::int,
       held   = core.gate_activity.held + $4::int`,
    [entries.map((one) => one.principal), entries.map((one) => one.scope), units, held ? 1 : 0],
  );
}

/** `auto` is the absence of a decision, so setting it deletes the row rather than storing a third value. */
export async function setPolicy(
  db: Queryable,
  principal: string,
  scope: GateScope,
  policy: GatePolicy,
  by: string,
  note: string | null,
): Promise<void> {
  if (policy === "auto") {
    await db.query("delete from core.gate_policy where principal = $1 and scope = $2", [principal, scope]);
    return;
  }
  await db.query(
    `insert into core.gate_policy (principal, scope, policy, note, set_by)
     values ($1, $2, $3, $4, $5)
     on conflict (principal, scope) do update set
       policy = excluded.policy, note = excluded.note, set_by = excluded.set_by, set_at = now()`,
    [principal, scope, policy, note, by],
  );
}
