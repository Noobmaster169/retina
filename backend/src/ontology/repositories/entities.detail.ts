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
 * Every time this thing was read, newest first, with how that email ended.
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
    side: "SI" | "BL";
    seen_at: Date;
    outcome: string | null;
  }>(
    `select er.email_id,
            er.run_id::text as run_id,
            em.subject,
            m.field,
            m.value,
            ex.role as side,
            em.first_seen_at as seen_at,
            cmp.status as outcome
       from core.entity_mentions m
       join core.email_runs er on er.id = m.email_run_id
       join core.emails em on em.email_id = er.email_id
       join core.extraction_fields ef on ef.id = m.extraction_field_id
       join core.extractions ex on ex.id = ef.extraction_id
       left join core.comparisons cmp on cmp.email_run_id = er.id
      where m.entity_id = $1::bigint
      order by em.first_seen_at desc, er.email_id desc
      limit $2`,
    [entityId, limit],
  );
  return rows.map((row) => ({
    emailId: row.email_id,
    runId: row.run_id,
    subject: row.subject,
    field: row.field,
    value: row.value,
    side: row.side,
    seenAt: row.seen_at.toISOString(),
    outcome: row.outcome,
  }));
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
       from core.entities e where e.id = $1::bigint`,
    [entityId],
  );
  const row = rows[0];
  if (!row) return [];

  const when = (at: Date | null, emailId: string | null): string | null =>
    at === null ? null : `${at.toISOString()}${emailId ? `, in ${emailId}` : ""}`;

  return [
    { key: "name", valueType: "abc", value: row.canonical, writtenBy: "a model", tone: null },
    { key: "kind", valueType: "enum", value: row.kind, writtenBy: "code", tone: null },
    { key: "appears_as", valueType: "list", value: row.fields.join(", ") || null, writtenBy: "code", tone: null },
    { key: "read_from", valueType: "123", value: String(row.mention_count), writtenBy: "code", tone: null },
    { key: "spellings", valueType: "123", value: String(row.name_count), writtenBy: "a model", tone: null },
    { key: "first_seen", valueType: "date", value: when(row.first_seen_at, row.first_email), writtenBy: "the source", tone: null },
    { key: "last_seen", valueType: "date", value: when(row.last_seen_at, row.last_email), writtenBy: "the source", tone: null },
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
