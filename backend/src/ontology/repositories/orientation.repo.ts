import type { Queryable } from "../../db";
import { listing, type EntityListing } from "./entities.search";

/**
 * What the database holds right now, read for a conversation's first turn.
 *
 * Values live here and never in a prompt file: which ports and parties exist
 * changes with every run and with a fresh seed, so they are queried. Fixed SQL,
 * no parameters a model wrote.
 */

/** Every port is listed up to this many; past it, the most mentioned and a count of the rest. */
export const ALL_PORTS_UP_TO = 60;
export const TOP_THINGS = 40;
const TOP_DOMAINS = 30;

export interface Counted {
  label: string;
  count: number;
}

export interface OrientationSnapshot {
  runs: number;
  latestRun: { id: string; totalEmails: number | null; createdAt: string; status: string } | null;
  /** The run the figures below are for: the conversation's, or the latest. */
  run: { id: string; scoped: boolean; emails: number; stages: Counted[] } | null;
  categories: Counted[];
  comparisons: Counted[];
  reviews: Counted[];
  judgedEmails: number;
  ports: { rows: EntityListing[]; total: number };
  parties: { rows: EntityListing[]; total: number };
  senderDomains: Counted[];
  watermark: string;
}

async function counted(db: Queryable, sql: string, params: unknown[]): Promise<Counted[]> {
  const { rows } = await db.query<{ label: string | null; n: string }>(sql, params);
  return rows.map((row) => ({ label: row.label ?? "(none)", count: Number(row.n) }));
}

/** Moves whenever a run progresses or the resolver rebuilds, which are the two things the snapshot reads. */
export async function watermark(db: Queryable): Promise<string> {
  const { rows } = await db.query<{ mark: string }>(
    `select concat_ws('|',
              (select count(*) from core.email_runs),
              (select coalesce(max(finished_at), 'epoch') from core.email_runs),
              (select coalesce(max(resolved_at), 'epoch') from core.entities)) as mark`,
  );
  return rows[0].mark;
}

export async function snapshot(db: Queryable, scopedRunId: string | null): Promise<OrientationSnapshot> {
  const latest = await db.query<{ id: string; total_emails: number | null; created_at: Date; status: string; runs: string }>(
    `select id::text as id, total_emails, created_at, status, (select count(*) from core.runs)::text as runs
       from core.runs order by created_at desc limit 1`,
  );
  const latestRun = latest.rows[0] ?? null;
  const runId = scopedRunId ?? latestRun?.id ?? null;

  const [stages, categories, comparisons, reviews, judged, ports, parties, senderDomains, mark] = await Promise.all([
    counted(db, "select stage as label, count(*)::text as n from core.email_runs where run_id = $1::uuid group by 1 order by 2 desc", [runId]),
    counted(
      db,
      `select coalesce(c.human_category, c.final_category) as label, count(*)::text as n
         from core.classifications c join core.email_runs er on er.id = c.email_run_id
        where er.run_id = $1::uuid group by 1 order by count(*) desc`,
      [runId],
    ),
    counted(
      db,
      `select cmp.status as label, count(*)::text as n
         from core.comparisons cmp join core.email_runs er on er.id = cmp.email_run_id
        where er.run_id = $1::uuid group by 1 order by count(*) desc`,
      [runId],
    ),
    counted(
      db,
      `select cmp.review_reason as label, count(*)::text as n
         from core.comparisons cmp join core.email_runs er on er.id = cmp.email_run_id
        where er.run_id = $1::uuid and cmp.review_reason is not null group by 1 order by count(*) desc`,
      [runId],
    ),
    db.query<{ n: string }>(
      `select count(distinct cmp.email_run_id)::text as n
         from core.field_diffs fd
         join core.comparisons cmp on cmp.id = fd.comparison_id
         join core.email_runs er on er.id = cmp.email_run_id
        where er.run_id = $1::uuid`,
      [runId],
    ),
    listing(db, "port", null, ALL_PORTS_UP_TO),
    listing(db, "party", null, TOP_THINGS),
    counted(db, `select sender_domain as label, count(*)::text as n from core.emails group by 1 order by count(*) desc limit ${TOP_DOMAINS}`, []),
    watermark(db),
  ]);

  // Past the cap the list is the most mentioned only, and the count of the rest says so.
  const shownPorts = ports.total > ALL_PORTS_UP_TO ? ports.rows.slice(0, TOP_THINGS) : ports.rows;

  return {
    runs: latestRun ? Number(latestRun.runs) : 0,
    latestRun: latestRun && {
      id: latestRun.id,
      totalEmails: latestRun.total_emails,
      createdAt: latestRun.created_at.toISOString(),
      status: latestRun.status,
    },
    run: runId
      ? { id: runId, scoped: scopedRunId !== null, emails: stages.reduce((sum, stage) => sum + stage.count, 0), stages }
      : null,
    categories,
    comparisons,
    reviews,
    judgedEmails: Number(judged.rows[0]?.n ?? 0),
    ports: { rows: shownPorts, total: ports.total },
    parties,
    senderDomains,
    watermark: mark,
  };
}

/** The newest run's id, for a tool asked about "the run" in a conversation that names none. */
export async function latestRunId(db: Queryable): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>("select id::text as id from core.runs order by created_at desc limit 1");
  return rows[0]?.id ?? null;
}
