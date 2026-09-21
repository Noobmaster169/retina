import type { GatePolicy, GateScope } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Every principal the gate has an opinion about, for the senders pane.
 *
 * Driven by what actually arrived, not by a table someone seeded, on the same
 * argument the clients page makes: a sender that has emailed us is a sender
 * whether or not anyone has ranked it. A principal with a policy and no
 * traffic is on it too, because someone decided something about it and that
 * decision should be visible and reversible.
 *
 * Facts only. The standing bracket and the caps are pure functions of these
 * numbers and the route applies them, so the page and the enqueue path cannot
 * end up computing two different answers from one row.
 */

export interface SenderFacts {
  principal: string;
  scope: GateScope;
  policy: GatePolicy;
  note: string | null;
  daysSeen: number;
  ageDays: number;
  firstSeen: string | null;
  lastSeen: string | null;
  unitsToday: number;
  emailsToday: number;
  heldToday: number;
  heldEver: number;
  recentDailyUnits: number[];
}

interface ListDbRow {
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
  held_ever: string;
  recent: number[] | null;
}

/**
 * The global bucket is left out: it is not a sender and a row offering to
 * blacklist everybody would be a mistake waiting to be clicked.
 */
export async function list(db: Queryable, limit = 500): Promise<SenderFacts[]> {
  return query(db, null, limit);
}

/**
 * One principal, for the write path. A policy change reads back the row it
 * just wrote, and scanning every sender to find it would put a full pass over
 * the activity table behind every click of a select.
 */
export async function one(db: Queryable, principal: string, scope: GateScope): Promise<SenderFacts | null> {
  const [found] = await query(db, { principal, scope }, 1);
  return found ?? null;
}

async function query(db: Queryable, only: { principal: string; scope: GateScope } | null, limit: number): Promise<SenderFacts[]> {
  const { rows } = await db.query<ListDbRow>(
    `with seen as (
       select principal, scope from core.gate_activity where scope in ('address','domain')
       union
       select principal, scope from core.gate_policy
     ),
     totals as (
       select principal, scope,
              count(*) filter (where emails > 0) as days_seen,
              min(day) as first_day,
              max(day) as last_day,
              sum(held) as held_ever
         from core.gate_activity
        where scope in ('address','domain')
        group by principal, scope
     )
     select s.principal, s.scope, p.policy, p.note,
            coalesce(t.days_seen, 0) as days_seen,
            t.first_day, t.last_day,
            coalesce(t.held_ever, 0) as held_ever,
            coalesce(today.units, 0) as units_today,
            coalesce(today.emails, 0) as emails_today,
            coalesce(today.held, 0) as held_today,
            (select array_agg(coalesce(d.units, 0) order by d.day)
               from (
                 select g::date as day,
                        (select units from core.gate_activity
                          where principal = s.principal and scope = s.scope and day = g::date) as units
                   from generate_series(current_date - 14, current_date - 1, interval '1 day') g
               ) d) as recent
       from seen s
       left join totals t on t.principal = s.principal and t.scope = s.scope
       left join core.gate_policy p on p.principal = s.principal and p.scope = s.scope
       left join core.gate_activity today
              on today.principal = s.principal and today.scope = s.scope and today.day = current_date
      where $2::text is null or (s.principal = $2::text and s.scope = $3::text)
      order by coalesce(today.units, 0) desc, coalesce(t.held_ever, 0) desc, s.principal asc
      limit $1`,
    [limit, only?.principal ?? null, only?.scope ?? null],
  );

  return rows.map((row) => {
    const first = row.first_day ? new Date(row.first_day) : null;
    return {
      principal: row.principal,
      scope: row.scope,
      policy: row.policy ?? "auto",
      note: row.note,
      daysSeen: Number(row.days_seen),
      ageDays: first ? Math.max(0, Math.floor((Date.now() - first.getTime()) / 86_400_000)) : 0,
      firstSeen: row.first_day,
      lastSeen: row.last_day,
      unitsToday: Number(row.units_today),
      emailsToday: Number(row.emails_today),
      heldToday: Number(row.held_today),
      heldEver: Number(row.held_ever),
      recentDailyUnits: (row.recent ?? []).map(Number),
    };
  });
}
