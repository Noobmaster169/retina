import { EntityKind, type EntityRow, type ObjectType } from "../../contracts";
import type { Queryable } from "../../db";
import { ENTITY_FIELDS } from "./entities.inputs";

/**
 * The things a model read, as the rest of the system asks about them.
 *
 * What the resolver reads is entities.inputs.ts and what it writes is
 * entities.resolution.ts. Every query here filters `merged_into is null`: a
 * merged thing keeps its row so a stored verdict can follow it, and it denotes
 * nothing, so it is never a row anybody lists or counts.
 */

interface EntityDbRow {
  id: string;
  kind: EntityKind;
  canonical: string;
  mention_count: number;
  name_count: number;
  emails: string;
  last_seen_at: Date | null;
}

function toRow(row: EntityDbRow): EntityRow {
  return {
    id: row.id,
    type: row.kind as ObjectType,
    name: row.canonical,
    mentions: row.mention_count,
    emails: Number(row.emails),
    names: row.name_count,
    lastSeen: row.last_seen_at?.toISOString() ?? null,
  };
}

/** Distinct emails a thing has been seen in, from either table. */
const EMAILS = `(select count(distinct a.email_id) from core.entity_appearances a where a.entity_id = e.id)::text as emails`;

/** Most-seen first, which is the order a person scanning for the important ones wants. */
export async function listByKind(db: Queryable, kind: EntityKind, limit = 200): Promise<EntityRow[]> {
  const { rows } = await db.query<EntityDbRow>(
    `select e.id::text as id, e.kind, e.canonical, e.mention_count, e.name_count, e.last_seen_at, ${EMAILS}
       from core.entities e
      where e.kind = $1::text and e.merged_into is null
      order by e.mention_count + e.sighting_count desc, e.canonical asc
      limit $2`,
    [kind, limit],
  );
  return rows.map(toRow);
}

export async function find(db: Queryable, id: string): Promise<EntityRow | null> {
  const { rows } = await db.query<EntityDbRow>(
    `select e.id::text as id, e.kind, e.canonical, e.mention_count, e.name_count, e.last_seen_at, ${EMAILS}
       from core.entities e where e.id = $1::bigint and e.merged_into is null`,
    [id],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Whether the resolved things still match what has been read.
 *
 * Its own check, not the analytics watermark. The views are created already
 * populated, so on a fresh database they are level with core while these
 * tables are empty, and gating the resolver on the views' staleness meant it
 * would never run until something else moved. Two derived things, two checks.
 *
 * Counting what was read against what resolved catches a new extraction, a new
 * sighting, and a resolver that has never run. A re-judged pair that merges two
 * clusters without adding a value is the case this misses, and the five minute
 * tick after the next email covers it.
 */
export async function isStale(db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ want: string; have: string; sighted: string; resolved: string }>(
    `select (select count(*) from core.extraction_fields ef
              where ef.field = any($1::text[]) and coalesce(ef.human_value, ef.value) is not null)::text as want,
            (select count(*) from core.entity_mentions)::text as have,
            (select count(*) from core.entity_sightings)::text as sighted,
            (select coalesce(sum(sighting_count), 0) from core.entities where merged_into is null)::text as resolved`,
    [ENTITY_FIELDS],
  );
  const row = rows[0];
  return row.want !== row.have || row.sighted !== row.resolved;
}

/** How many of each kind exist, for the rail's counts. A kind with none reads 0 rather than being absent. */
export async function countsByKind(db: Queryable): Promise<Record<EntityKind, number>> {
  const { rows } = await db.query<{ kind: EntityKind; n: string }>(
    "select kind, count(*)::text as n from core.entities where merged_into is null group by kind",
  );
  const counts = Object.fromEntries(EntityKind.options.map((kind) => [kind, 0])) as Record<EntityKind, number>;
  for (const row of rows) counts[row.kind] = Number(row.n);
  return counts;
}

/** Marks things for the profile job to rewrite. Called with the ids one email's job touched. */
export async function markStale(tx: Queryable, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.query("update core.entities set stale = true where id = any($1::bigint[])", [ids.map(String)]);
}
