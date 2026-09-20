import type { ObjectRecord, ObjectType } from "../../contracts";
import type { Queryable } from "../../db";
import { entityDetail, entities as entitiesRepo } from "../repositories";
import { emailRecord } from "./record.email";
import { descriptorFor, isBuilt } from "./types";

/**
 * One object of any type, in one shape.
 *
 * The dispatcher is a switch and not a registry of functions, because four of
 * the twelve types read the same two tables and a registry would have been an
 * abstraction over one real difference: an email has its own eleven values,
 * and everything else is a thinner version of the same page.
 */

/** A resolved thing: a port or a party. Everything it knows came out of a document. */
async function entityRecord(db: Queryable, type: "port" | "party", id: string): Promise<ObjectRecord | null> {
  const row = await entitiesRepo.find(db, id);
  if (!row || row.type !== type) return null;

  const [values, links] = await Promise.all([entityDetail.values(db, id), entityDetail.around(db, id)]);
  return {
    type,
    id,
    title: row.name,
    blurb: descriptorFor(type).blurb,
    badges: [
      { label: descriptorFor(type).label, tone: "neutral" },
      { label: `${row.names} ${row.names === 1 ? "spelling" : "spellings"}`, tone: "ink" },
    ],
    values,
    links,
    // A resolved thing has no page of its own outside the ontology, because
    // the ontology is where it exists. Its database page is the same record.
    openHref: null,
  };
}

interface ComparisonRow {
  id: string;
  email_id: string;
  run_id: string;
  status: string;
  review_reason: string | null;
  si_name: string | null;
  bl_name: string | null;
  judgements: string;
  differed: string;
  defect_fields: string[] | null;
  actions: string;
}

/** One check. It holds seven judgements and never records which document is right. */
async function comparisonRecord(db: Queryable, id: string): Promise<ObjectRecord | null> {
  const { rows } = await db.query<ComparisonRow>(
    `select c.id::text as id, er.email_id, er.run_id::text as run_id, c.status, c.review_reason,
            (select d.text_object_key from core.extractions ex
               join core.documents d on d.id = ex.document_id
              where ex.email_run_id = er.id and ex.role = 'SI' limit 1) as si_name,
            (select d.text_object_key from core.extractions ex
               join core.documents d on d.id = ex.document_id
              where ex.email_run_id = er.id and ex.role = 'BL' limit 1) as bl_name,
            (select count(*) from core.field_diffs fd where fd.comparison_id = c.id)::text as judgements,
            (select count(*) from core.field_diffs fd where fd.comparison_id = c.id and not fd.same and not fd.missing)::text as differed,
            (select array_agg(fd.field order by fd.field) from core.field_diffs fd
              where fd.comparison_id = c.id and not fd.same and not fd.missing) as defect_fields,
            (select count(*) from core.review_actions ra where ra.email_run_id = er.id)::text as actions
       from core.comparisons c
       join core.email_runs er on er.id = c.email_run_id
      where c.id = $1::bigint`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const differed = Number(row.differed);
  const agreed = Number(row.judgements) - differed;

  return {
    type: "comparison",
    id,
    title: `comparison_${row.email_id.replace(/^email_/, "")}`,
    blurb: descriptorFor("comparison").blurb,
    badges: [
      { label: "Comparison", tone: "neutral" },
      { label: row.status, tone: row.status === "MISMATCH" ? "differ" : row.status === "NEEDS_REVIEW" ? "review" : "match" },
    ],
    values: [
      { key: "si_document", valueType: "abc", value: row.si_name, writtenBy: "code", tone: null },
      { key: "bl_document", valueType: "abc", value: row.bl_name, writtenBy: "code", tone: null },
      { key: "status", valueType: "enum", value: row.status, writtenBy: "code", tone: row.status === "MISMATCH" ? "differ" : null },
      {
        key: "defect_fields",
        valueType: "list",
        value: row.defect_fields?.join(", ") ?? null,
        writtenBy: "code",
        tone: differed > 0 ? "differ" : null,
      },
      {
        key: "review_reason",
        valueType: "enum",
        value: row.review_reason,
        writtenBy: row.review_reason ? "code" : "nothing wrote it",
        tone: row.review_reason ? "review" : null,
      },
    ],
    links: [
      { key: "judgements", label: "Every judgement it made", sub: `${agreed} agree, ${differed} differ`, count: Number(row.judgements), target: null, targetType: "difference", derived: false, tone: null },
      { key: "email", label: "The email it is about", sub: row.email_id, count: 1, target: { type: "email", id: row.email_id }, targetType: "email", derived: false, tone: null },
      { key: "actions", label: "What a person did", sub: "via review_actions", count: Number(row.actions), target: null, targetType: null, derived: false, tone: null },
    ],
    openHref: `/runs/${row.run_id}/emails/${row.email_id}`,
  };
}

/** A sender, and what it has sent. Driven off emails so an unranked sender is still a client. */
async function clientRecord(db: Queryable, domain: string): Promise<ObjectRecord | null> {
  const { rows } = await db.query<{
    domain: string;
    name: string | null;
    tier: number;
    kind: string;
    known: boolean;
    emails: string;
    mismatches: string;
  }>("select domain, name, tier, kind, known, emails::text, mismatches::text from analytics.dim_client where domain = $1::text", [
    domain,
  ]);
  const row = rows[0];
  if (!row) return null;

  return {
    type: "client",
    id: row.domain,
    title: row.name ?? row.domain,
    blurb: descriptorFor("client").blurb,
    badges: [
      { label: "Client", tone: "neutral" },
      { label: `tier ${row.tier}`, tone: row.known ? "ink" : "neutral" },
    ],
    values: [
      { key: "domain", valueType: "pk", value: row.domain, writtenBy: "the source", tone: null },
      { key: "name", valueType: "abc", value: row.name, writtenBy: row.name ? "a person" : "nothing wrote it", tone: null },
      { key: "tier", valueType: "123", value: String(row.tier), writtenBy: row.known ? "a person" : "code", tone: null },
      { key: "kind", valueType: "enum", value: row.kind, writtenBy: row.known ? "a person" : "code", tone: null },
    ],
    links: [
      { key: "emails", label: "Emails it sent", sub: "via sender_domain", count: Number(row.emails), target: null, targetType: "email", derived: false, tone: null },
      { key: "mismatches", label: "Of those, a MISMATCH", sub: "via comparisons", count: Number(row.mismatches), target: null, targetType: "email", derived: true, tone: "differ" },
    ],
    openHref: "/clients",
  };
}

/** Null for an id nothing holds, and for a type the schema does not hold at all. */
export async function objectRecord(
  db: Queryable,
  type: ObjectType,
  id: string,
  runId: string | null,
): Promise<ObjectRecord | null> {
  if (!isBuilt(type)) return null;
  if (type === "email") return emailRecord(db, id, runId);
  if (type === "port" || type === "party") return entityRecord(db, type, id);
  if (type === "comparison") return comparisonRecord(db, id);
  if (type === "client") return clientRecord(db, id);
  return null;
}
