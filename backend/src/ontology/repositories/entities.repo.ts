import type { ComparisonField, EntityRow, ObjectType } from "../../contracts";
import type { Queryable } from "../../db";
import type { EntityKind, Mention, ResolvedEntity, Verdict } from "../../pipeline/ontology";

/**
 * The things the extractor read, and the spellings that were judged into them.
 *
 * These three tables are derived: `resolveEntities` rebuilds them exactly from
 * `extraction_fields` and `field_diffs`, so replacing them wholesale is the
 * documented way to refresh them and not a deletion of anything. It is the
 * same rule the pipeline already follows, where re-running a stage replaces
 * that stage's rows.
 */

/** The fields that denote a thing. Kept beside the resolver's own map so one query reads what the other resolves. */
const ENTITY_FIELDS: ComparisonField[] = [
  "port_of_loading",
  "port_of_discharge",
  "shipper",
  "consignee",
  "notify_party",
];

interface MentionRow {
  id: string;
  email_run_id: string;
  field: ComparisonField;
  value: string;
  seen_at: Date;
}

/**
 * Every value the extractor stored for a field that denotes a thing.
 *
 * A person's correction wins over the model's reading, the same precedence
 * every other screen uses, so a party a reviewer corrected resolves under the
 * corrected spelling rather than the wrong one.
 */
export async function loadMentions(db: Queryable): Promise<Mention[]> {
  const { rows } = await db.query<MentionRow>(
    `select ef.id::text as id,
            ex.email_run_id::text as email_run_id,
            ef.field,
            coalesce(ef.human_value, ef.value) as value,
            em.first_seen_at as seen_at
       from core.extraction_fields ef
       join core.extractions ex on ex.id = ef.extraction_id
       join core.email_runs er on er.id = ex.email_run_id
       join core.emails em on em.email_id = er.email_id
      where ef.field = any($1::text[])
        and coalesce(ef.human_value, ef.value) is not null`,
    [ENTITY_FIELDS],
  );
  return rows.map((row) => ({
    extractionFieldId: Number(row.id),
    emailRunId: Number(row.email_run_id),
    field: row.field,
    value: row.value,
    seenAt: row.seen_at,
  }));
}

/** Every pair the field judge said denotes one thing. The only edge that ever joins two spellings. */
export async function loadVerdicts(db: Queryable): Promise<Verdict[]> {
  const { rows } = await db.query<{
    field: ComparisonField;
    si_value: string | null;
    bl_value: string | null;
    confidence: string | null;
  }>(
    `select field, si_value, bl_value, confidence
       from core.field_diffs
      where same and not missing and field = any($1::text[])`,
    [ENTITY_FIELDS],
  );
  return rows.map((row) => ({
    field: row.field,
    siValue: row.si_value,
    blValue: row.bl_value,
    same: true,
    confidence: row.confidence === null ? null : Number(row.confidence),
  }));
}

/**
 * Replaces every resolved thing with the given set, in one transaction.
 *
 * Wholesale rather than incrementally: a single new verdict can merge two
 * clusters that were separate, which changes which spelling is canonical and
 * therefore the identity of both. Rebuilding is correct and, at this size,
 * cheaper than working out what moved.
 */
export async function replaceAll(tx: Queryable, entities: ResolvedEntity[]): Promise<number> {
  // Cascades to entity_names and entity_mentions.
  await tx.query("delete from core.entities");

  for (const entity of entities) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into core.entities (kind, canonical, mention_count, name_count, first_seen_at, last_seen_at)
       values ($1::text, $2::text, $3::int, $4::int, $5::timestamptz, $6::timestamptz)
       returning id::text as id`,
      [entity.kind, entity.canonical, entity.mentions.length, entity.names.length, entity.firstSeenAt, entity.lastSeenAt],
    );
    const id = rows[0].id;

    for (const name of entity.names) {
      await tx.query(
        `insert into core.entity_names (entity_id, value, seen_count, joined_by, confidence)
         values ($1::bigint, $2::text, $3::int, $4::text, $5::numeric)`,
        [id, name.value, name.seenCount, name.joinedBy, name.confidence],
      );
    }
    for (const mention of entity.mentions) {
      await tx.query(
        `insert into core.entity_mentions (entity_id, extraction_field_id, email_run_id, field, value)
         values ($1::bigint, $2::bigint, $3::bigint, $4::text, $5::text)`,
        [id, mention.extractionFieldId, mention.emailRunId, mention.field, mention.value],
      );
    }
  }
  return entities.length;
}

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

/** Most-seen first, which is the order a person scanning for the important ones wants. */
export async function listByKind(db: Queryable, kind: EntityKind, limit = 200): Promise<EntityRow[]> {
  const { rows } = await db.query<EntityDbRow>(
    `select e.id::text as id, e.kind, e.canonical, e.mention_count, e.name_count, e.last_seen_at,
            (select count(distinct er.email_id)
               from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
              where m.entity_id = e.id)::text as emails
       from core.entities e
      where e.kind = $1::text
      order by e.mention_count desc, e.canonical asc
      limit $2`,
    [kind, limit],
  );
  return rows.map(toRow);
}

export async function find(db: Queryable, id: string): Promise<EntityRow | null> {
  const { rows } = await db.query<EntityDbRow>(
    `select e.id::text as id, e.kind, e.canonical, e.mention_count, e.name_count, e.last_seen_at,
            (select count(distinct er.email_id)
               from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
              where m.entity_id = e.id)::text as emails
       from core.entities e where e.id = $1::bigint`,
    [id],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/** How many of each kind exist, for the rail's counts. A kind with none reads 0 rather than being absent. */
export async function countsByKind(db: Queryable): Promise<Record<EntityKind, number>> {
  const { rows } = await db.query<{ kind: EntityKind; n: string }>(
    "select kind, count(*)::text as n from core.entities group by kind",
  );
  const counts: Record<EntityKind, number> = { port: 0, party: 0 };
  for (const row of rows) counts[row.kind] = Number(row.n);
  return counts;
}
