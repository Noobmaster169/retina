import type { EntityAppearance, EntityName, ObjectLink, StoredValue } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * The four parts a thing opens into: what is stored, how it is written, where
 * it appeared, and what is around it.
 *
 * Split from entities.repo.ts because that one resolves and writes and this
 * one only reads one thing, and the two have no query in common.
 */

/** The label the design puts on each way a spelling joined, rather than the enum value. */
const JOINED_AS: Record<EntityName["joinedBy"], string> = {
  kept: "the spelling kept",
  judge: "same thing",
  human: "joined by a person",
};

export function verdictWords(name: EntityName): string {
  if (name.joinedBy !== "judge") return JOINED_AS[name.joinedBy];
  // The confidence is the argument. A spelling accepted at 0.85 is a different
  // claim from one accepted at 0.99 and the screen should not flatten them.
  return name.confidence === null ? JOINED_AS.judge : `${JOINED_AS.judge}, ${name.confidence}`;
}

export async function names(db: Queryable, entityId: string): Promise<EntityName[]> {
  const { rows } = await db.query<{
    value: string;
    seen_count: number;
    joined_by: EntityName["joinedBy"];
    confidence: string | null;
  }>(
    `select value, seen_count, joined_by, confidence
       from core.entity_names
      where entity_id = $1::bigint
      order by seen_count desc, value asc`,
    [entityId],
  );
  return rows.map((row) => ({
    value: row.value,
    seenCount: row.seen_count,
    joinedBy: row.joined_by,
    confidence: row.confidence === null ? null : Number(row.confidence),
  }));
}

/**
 * Every email this thing was read out of, newest first, with how that email
 * ended.
 *
 * One row per email and field. A port read from both documents of one email is
 * one appearance read twice, and the same email replayed in three runs is
 * still one appearance: `distinct on` keeps the newest run's, whose comparison
 * is the outcome worth showing. Before this the list repeated one subject
 * three times and React refused the duplicate keys.
 *
 * The outcome is joined rather than stored: copying a comparison's status onto
 * a mention would let this page and the email page disagree the moment someone
 * corrects one.
 */
export async function appearances(db: Queryable, entityId: string, limit = 50): Promise<EntityAppearance[]> {
  const { rows } = await db.query<{
    email_id: string;
    run_id: string;
    subject: string;
    field: string;
    value: string;
    sides: ("SI" | "BL")[];
    seen_at: Date;
    outcome: string | null;
  }>(
    `select * from (
       select distinct on (er.email_id, m.field)
              er.email_id,
              er.run_id::text as run_id,
              em.subject,
              m.field,
              m.value,
              em.first_seen_at as seen_at,
              cmp.status as outcome,
              (select coalesce(array_agg(distinct ex2.role order by ex2.role), '{}')
                 from core.entity_mentions m2
                 join core.extraction_fields ef2 on ef2.id = m2.extraction_field_id
                 join core.extractions ex2 on ex2.id = ef2.extraction_id
                where m2.entity_id = m.entity_id and m2.email_run_id = er.id and m2.field = m.field) as sides
         from core.entity_mentions m
         join core.email_runs er on er.id = m.email_run_id
         join core.emails em on em.email_id = er.email_id
         left join core.comparisons cmp on cmp.email_run_id = er.id
        where m.entity_id = $1::bigint
        order by er.email_id, m.field, er.started_at desc
     ) newest
     order by seen_at desc, email_id desc
     limit $2`,
    [entityId, limit],
  );
  return rows.map((row) => ({
    emailId: row.email_id,
    runId: row.run_id,
    subject: row.subject,
    field: row.field,
    value: row.value,
    sides: row.sides,
    seenAt: row.seen_at.toISOString(),
    outcome: row.outcome,
  }));
}

/** How many appearances there are, on the same grain the list uses. */
export async function appearanceCount(db: Queryable, entityId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n
       from (select distinct er.email_id, m.field
               from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
              where m.entity_id = $1::bigint) distinct_appearances`,
    [entityId],
  );
  return Number(rows[0].n);
}

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
               from core.entity_mentions m where m.entity_id = e.id) as fields
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
  ];
}

/**
 * Step out from here: a whole link type at once, with its count.
 *
 * A link with nothing at the other end still gets a row. Knowing there are no
 * differences about a port is worth a line, and the design draws it greyed and
 * unclickable rather than leaving the reader to wonder whether it was checked.
 */
export async function around(db: Queryable, entityId: string): Promise<ObjectLink[]> {
  const { rows } = await db.query<{
    emails: string;
    runs: string;
    documents: string;
    differed: string;
    reviewed: string;
    clients: string;
  }>(
    `with m as (select * from core.entity_mentions where entity_id = $1::bigint)
     select (select count(distinct er.email_id) from m join core.email_runs er on er.id = m.email_run_id)::text as emails,
            (select count(distinct er.run_id) from m join core.email_runs er on er.id = m.email_run_id)::text as runs,
            (select count(distinct ex.document_id) from m
               join core.extraction_fields ef on ef.id = m.extraction_field_id
               join core.extractions ex on ex.id = ef.extraction_id)::text as documents,
            (select count(*) from m
               join core.email_runs er on er.id = m.email_run_id
               join core.comparisons cmp on cmp.email_run_id = er.id
               join core.field_diffs fd on fd.comparison_id = cmp.id and fd.field = m.field
              where not fd.same and not fd.missing)::text as differed,
            (select count(distinct er.email_id) from m
               join core.email_runs er on er.id = m.email_run_id
               join core.comparisons cmp on cmp.email_run_id = er.id
              where cmp.status = 'NEEDS_REVIEW')::text as reviewed,
            (select count(distinct em.sender_domain) from m
               join core.email_runs er on er.id = m.email_run_id
               join core.emails em on em.email_id = er.email_id)::text as clients`,
    [entityId],
  );
  const row = rows[0];

  const link = (
    key: string,
    label: string,
    sub: string,
    count: number,
    targetType: ObjectLink["targetType"],
    derived = false,
    tone: ObjectLink["tone"] = null,
  ): ObjectLink => ({ key, label, sub, count, target: null, targetType, derived, tone: count === 0 ? null : tone });

  return [
    link("documents", "Documents it was read from", "the extractor proved it there", Number(row.documents), "document"),
    link("emails", "Emails that name it", "via extraction_fields", Number(row.emails), "email"),
    link("clients", "Senders whose mail names it", "via emails", Number(row.clients), "client", true),
    link("differed", "Times the field it filled differed", "via field_diffs", Number(row.differed), "difference", true, "differ"),
    link("reviewed", "Emails about it that needed a person", "via comparisons", Number(row.reviewed), "email", true, "review"),
    link("runs", "Runs that saw it", "via email_runs", Number(row.runs), "run"),
  ];
}
