import type { Queryable } from "../../db";
import type { EntityKind } from "../../pipeline/ontology";

/**
 * One resolved thing as the chat describes it: its spellings, and where it
 * appears by field. Split from entities.search.ts, which finds things; this
 * reads one.
 */

export interface EntityOverview {
  id: string;
  kind: EntityKind;
  canonical: string;
  names: { value: string; seenCount: number; joinedBy: string; confidence: number | null }[];
  byField: { field: string; mentions: number; emails: number }[];
  emails: number;
  runs: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

/** Everything the chat says about one thing in one call: its spellings, and where it appears by field. */
export async function overview(db: Queryable, id: string): Promise<EntityOverview | null> {
  const head = await db.query<{
    id: string;
    kind: EntityKind;
    canonical: string;
    first_seen_at: Date | null;
    last_seen_at: Date | null;
  }>(
    "select id::text as id, kind, canonical, first_seen_at, last_seen_at from core.entities where id = $1::bigint",
    [id],
  );
  const entity = head.rows[0];
  if (!entity) return null;

  const [names, fields, totals] = await Promise.all([
    db.query<{ value: string; seen_count: number; joined_by: string; confidence: string | null }>(
      `select value, seen_count, joined_by, confidence::text as confidence
         from core.entity_names where entity_id = $1::bigint
        order by seen_count desc, value asc`,
      [id],
    ),
    db.query<{ field: string; mentions: string; emails: string }>(
      `select m.field, count(*)::text as mentions, count(distinct er.email_id)::text as emails
         from core.entity_mentions m
         join core.email_runs er on er.id = m.email_run_id
        where m.entity_id = $1::bigint
        group by m.field order by count(*) desc`,
      [id],
    ),
    db.query<{ emails: string; runs: string }>(
      `select count(distinct er.email_id)::text as emails, count(distinct er.run_id)::text as runs
         from core.entity_mentions m
         join core.email_runs er on er.id = m.email_run_id
        where m.entity_id = $1::bigint`,
      [id],
    ),
  ]);

  return {
    id: entity.id,
    kind: entity.kind,
    canonical: entity.canonical,
    names: names.rows.map((row) => ({
      value: row.value,
      seenCount: row.seen_count,
      joinedBy: row.joined_by,
      confidence: row.confidence === null ? null : Number(row.confidence),
    })),
    byField: fields.rows.map((row) => ({ field: row.field, mentions: Number(row.mentions), emails: Number(row.emails) })),
    emails: Number(totals.rows[0].emails),
    runs: Number(totals.rows[0].runs),
    firstSeenAt: entity.first_seen_at?.toISOString() ?? null,
    lastSeenAt: entity.last_seen_at?.toISOString() ?? null,
  };
}
