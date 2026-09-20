import type { StoredValue } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * What is stored about one thing, as the Record tab's value list reads it.
 *
 * Its own file because the list grew: the resolver's own columns, and since
 * phase 10f every attribute the profile step decided, each row saying whether
 * it was read in our mail or known already.
 */

/** What is stored about a thing. Nobody typed any of it in, and the last line says so. */
export async function values(db: Queryable, entityId: string): Promise<StoredValue[]> {
  const { rows } = await db.query<{
    kind: string;
    canonical: string;
    mention_count: number;
    name_count: number;
    first_seen_at: Date | null;
    last_seen_at: Date | null;
    first_email: string | null;
    last_email: string | null;
    fields: string[];
    attributes: Record<string, string | null>;
    attributes_source: Record<string, { source?: string }>;
  }>(
    `select e.kind, e.canonical, e.mention_count, e.name_count, e.first_seen_at, e.last_seen_at,
            (select er.email_id from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
               join core.emails em on em.email_id = er.email_id
              where m.entity_id = e.id order by em.first_seen_at asc limit 1) as first_email,
            (select er.email_id from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
               join core.emails em on em.email_id = er.email_id
              where m.entity_id = e.id order by em.first_seen_at desc limit 1) as last_email,
            (select coalesce(array_agg(distinct m.field order by m.field), '{}')
               from core.entity_mentions m where m.entity_id = e.id) as fields,
            e.attributes, e.attributes_source
       from core.entities e where e.id = $1::bigint and e.merged_into is null`,
    [entityId],
  );
  const row = rows[0];
  if (!row) return [];

  // A timestamp crosses the wire as an ISO string and is read for people in
  // one place, lib/when.ts. The email it was seen in is its own row rather
  // than glued onto the end of the date, because a composite string would
  // have to be taken apart again before it could be formatted.
  return [
    { key: "name", valueType: "abc", value: row.canonical, writtenBy: "a model", tone: null },
    { key: "kind", valueType: "enum", value: row.kind, writtenBy: "code", tone: null },
    { key: "appears_as", valueType: "list", value: row.fields.join(", ") || null, writtenBy: "code", tone: null },
    { key: "read_from", valueType: "123", value: String(row.mention_count), writtenBy: "code", tone: null },
    { key: "spellings", valueType: "123", value: String(row.name_count), writtenBy: "a model", tone: null },
    { key: "first_seen", valueType: "date", value: row.first_seen_at?.toISOString() ?? null, writtenBy: "the source", tone: null },
    { key: "first_seen_in", valueType: "pk", value: row.first_email, writtenBy: "the source", tone: null },
    { key: "last_seen", valueType: "date", value: row.last_seen_at?.toISOString() ?? null, writtenBy: "the source", tone: null },
    { key: "last_seen_in", valueType: "pk", value: row.last_email, writtenBy: "the source", tone: null },
    // What the profile step decided this thing is. Every one of them was
    // written by a model, and the source says whether it read it in our mail
    // or knew it already, which is the distinction the whole layer turns on.
    ...Object.entries(row.attributes).map(([key, value]) => ({
      key: row.attributes_source[key]?.source === "mail" ? `${key} (from our mail)` : `${key} (general knowledge)`,
      valueType: "abc" as const,
      value,
      writtenBy: "a model" as const,
      tone: null,
    })),
  ];
}
