import type { ComparisonField } from "../../contracts";
import type { Queryable } from "../../db";
import type { EntityKind, ExistingEntity, Mention, Sighting, Verdict } from "../../pipeline/ontology";

/**
 * Everything a resolution pass reads: the values a model read, the verdicts
 * that may join two of them, and the things the database already holds.
 *
 * Split from entities.repo.ts, which is what the rest of the system asks about
 * a resolved thing. This file is only the resolver's input side.
 */

/** The fields that denote a thing. Kept beside the resolver's own map so one query reads what the other resolves. */
export const ENTITY_FIELDS: ComparisonField[] = [
  "port_of_loading",
  "port_of_discharge",
  "shipper",
  "consignee",
  "notify_party",
];

/** Which entity kind each sighting role denotes. The roles are `core.entity_sightings.role`. */
const KIND_OF_ROLE: Record<string, EntityKind> = {
  shipper: "party",
  on_behalf_of: "party",
  consignee: "party",
  notify_party: "party",
  port_of_loading: "port",
  port_of_discharge: "port",
  carrier: "carrier",
  vessel: "vessel",
  commodity: "commodity",
  sender: "person",
  signer: "person",
  addressee: "person",
  mentioned: "party",
};

/**
 * Every value the extractor stored for a field that denotes a thing.
 *
 * A person's correction wins over the model's reading, the same precedence
 * every other screen uses, so a party a reviewer corrected resolves under the
 * corrected spelling rather than the wrong one.
 */
export async function loadMentions(db: Queryable): Promise<Mention[]> {
  const { rows } = await db.query<{ id: string; email_run_id: string; field: ComparisonField; value: string; seen_at: Date }>(
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

/**
 * Every spelling the `shipment-read` step read somewhere no extraction field
 * reaches. The role says which kind of thing it denotes, because a sighting
 * has no comparison field to take that from.
 */
export async function loadSightings(db: Queryable): Promise<Sighting[]> {
  const { rows } = await db.query<{ role: string; surface: string; seen_at: Date }>(
    `select s.role, s.surface, em.first_seen_at as seen_at
       from core.entity_sightings s
       join core.emails em on em.email_id = s.email_id`,
  );
  return rows.flatMap((row) => {
    const kind = KIND_OF_ROLE[row.role];
    return kind ? [{ kind, value: row.surface, seenAt: row.seen_at }] : [];
  });
}

/** Every pair the field judge said denotes one thing. */
export async function loadVerdicts(db: Queryable): Promise<Verdict[]> {
  const { rows } = await db.query<{ field: ComparisonField; si_value: string | null; bl_value: string | null; confidence: string | null }>(
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
 * Every join the `entity-resolve` step made, read back as a verdict.
 *
 * It is the same shape the field judge's verdicts arrive in, so the resolver
 * has one rule for both and the two sources of joins cannot disagree about
 * which cluster a spelling is in. The pair is the spelling and the canonical
 * of the thing it was judged into, which is a spelling of that thing too.
 */
export async function loadResolveJoins(db: Queryable): Promise<Verdict[]> {
  const { rows } = await db.query<{ kind: EntityKind; value: string; canonical: string; confidence: string | null }>(
    `select e.kind, n.value, e.canonical, n.confidence::text as confidence
       from core.entity_names n
       join core.entities e on e.id = n.entity_id
      where n.joined_step is not null and e.merged_into is null`,
  );
  return rows.map((row) => ({
    kind: row.kind,
    siValue: row.value,
    blValue: row.canonical,
    same: true,
    confidence: row.confidence === null ? null : Number(row.confidence),
    step: "entity-resolve",
  }));
}

/** Every thing the database holds, with the spellings that decide which cluster is which. */
export async function loadExisting(db: Queryable): Promise<ExistingEntity[]> {
  const { rows } = await db.query<{ id: string; kind: EntityKind; mention_count: number; names: { value: string; seen_count: number }[] }>(
    `select e.id::text as id, e.kind, e.mention_count,
            coalesce((select json_agg(json_build_object('value', n.value, 'seen_count', n.seen_count))
                        from core.entity_names n where n.entity_id = e.id), '[]'::json) as names
       from core.entities e
      where e.merged_into is null`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    mentionCount: row.mention_count,
    names: row.names.map((name) => ({ value: name.value, seenCount: name.seen_count })),
  }));
}
