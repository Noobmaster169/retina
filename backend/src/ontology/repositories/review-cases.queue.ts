import type { ReviewCaseItem, ReviewCaseKind, ReviewQuery, ReviewQueue, ReviewReason, ReviewStats } from "../../contracts";
import { ReviewReason as Reasons } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * The review inbox as a list, and what it says about itself. Reading only: the
 * case aggregate's writes are in review-cases.repo.ts, which re-exports these
 * two so a caller sees one repository.
 */

interface ItemRow {
  id: string;
  run_id: string;
  email_id: string;
  subject: string;
  from_addr: string;
  kind: ReviewCaseKind;
  reason: ReviewReason | null;
  stage: string;
  status: "open" | "resolved";
  opened_at: Date;
  actions: string;
  last_action_at: Date | null;
  last_action_by: string | null;
}

function toItem(row: ItemRow): ReviewCaseItem {
  return {
    id: row.id,
    runId: row.run_id,
    emailId: row.email_id,
    subject: row.subject,
    from: row.from_addr,
    kind: row.kind,
    reason: row.reason,
    stage: row.stage,
    status: row.status,
    openedAt: row.opened_at.toISOString(),
    actions: Number(row.actions),
    lastActionAt: row.last_action_at?.toISOString() ?? null,
    lastActionBy: row.last_action_by,
  };
}

const ITEM_SELECT = `
  select rc.id, er.run_id, er.email_id, e.subject, e.from_addr, rc.kind, rc.reason, rc.stage, rc.status, rc.opened_at,
         count(ra.id) as actions, max(ra.created_at) as last_action_at,
         (array_agg(ra.actor order by ra.created_at desc) filter (where ra.id is not null))[1] as last_action_by
    from core.review_cases rc
    join core.email_runs er on er.id = rc.email_run_id
    join core.emails e on e.email_id = er.email_id
    left join core.review_actions ra on ra.review_case_id = rc.id`;

const GROUP_BY = "group by rc.id, er.run_id, er.email_id, e.subject, e.from_addr";

/** One case as the queue shows it, for the answer to an action. */
export async function item(db: Queryable, id: string): Promise<ReviewCaseItem | null> {
  const { rows } = await db.query<ItemRow>(`${ITEM_SELECT} where rc.id = $1 ${GROUP_BY}`, [id]);
  return rows[0] ? toItem(rows[0]) : null;
}

const FILTER = `
  ($2::text = 'all' or rc.status = $2)
  and ($3::text is null or rc.reason = $3)
  and ($4::text is null or rc.kind = $4)
  and ($1::uuid is null or er.run_id = $1)`;

/** One page of cases, oldest first: the queue is worked from the front. */
export async function list(db: Queryable, query: ReviewQuery): Promise<ReviewQueue> {
  const filters = [query.runId ?? null, query.status, query.reason ?? null, query.kind ?? null];
  const { rows } = await db.query<ItemRow>(
    `${ITEM_SELECT} where ${FILTER} ${GROUP_BY} order by rc.opened_at, rc.id limit $5 offset $6`,
    [...filters, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const { rows: counted } = await db.query<{ n: string }>(
    `select count(*) as n from core.review_cases rc join core.email_runs er on er.id = rc.email_run_id where ${FILTER}`,
    filters,
  );
  return { cases: rows.map(toItem), total: Number(counted[0].n), page: query.page, pageSize: query.pageSize };
}

interface StatsRow {
  reason: ReviewReason | null;
  kind: ReviewCaseKind;
  n: string;
}

/** What the queue holds and what it has been getting through. Scoped to one run, or across every run. */
export async function stats(db: Queryable, runId: string | null): Promise<ReviewStats> {
  const byReason = Object.fromEntries(Reasons.options.map((reason) => [reason, 0])) as ReviewStats["byReason"];
  const [open, done] = await Promise.all([
    db.query<StatsRow>(
      `select rc.reason, rc.kind, count(*) as n
         from core.review_cases rc join core.email_runs er on er.id = rc.email_run_id
        where rc.status = 'open' and ($1::uuid is null or er.run_id = $1)
        group by rc.reason, rc.kind`,
      [runId],
    ),
    db.query<{ today: string; median: string | null }>(
      `select count(*) filter (where rc.resolved_at >= date_trunc('day', now())) as today,
              percentile_cont(0.5) within group (
                order by extract(epoch from rc.resolved_at - rc.opened_at) * 1000
              ) filter (where rc.resolved_at >= now() - interval '7 days') as median
         from core.review_cases rc join core.email_runs er on er.id = rc.email_run_id
        where rc.status = 'resolved' and ($1::uuid is null or er.run_id = $1)`,
      [runId],
    ),
  ]);

  let openTotal = 0;
  let failures = 0;
  for (const row of open.rows) {
    const n = Number(row.n);
    openTotal += n;
    if (row.kind === "failure") failures += n;
    if (row.reason) byReason[row.reason] = n;
  }
  const row = done.rows[0];
  return {
    open: openTotal,
    byReason,
    failures,
    resolvedToday: Number(row?.today ?? 0),
    medianResolveMs: row?.median == null ? null : Math.round(Number(row.median)),
  };
}
