import type { ObjectLink, ObjectRecord, StoredValue } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * One email as the model holds it: eleven stored values, each saying who wrote
 * it, and eight links.
 *
 * The `written by` column is the argument this page makes. A reader can see at
 * a glance that the sender supplied four of these, a model decided two, code
 * derived four from those, and one was never written at all. That is the
 * difference between a record and a row.
 */

interface EmailRow {
  email_id: string;
  from_addr: string;
  sender_domain: string;
  subject: string;
  first_seen_at: Date;
  run_id: string;
  final_category: string | null;
  human_category: string | null;
  gen_confidence: string | null;
  decided_by: string | null;
  status: string | null;
  review_reason: string | null;
  attachments: string;
  documents: string;
  fields: string;
  differences: string;
  comparisons: string;
  defect_fields: string[] | null;
  same_client_differed: string;
  same_consignee: string;
  shipment_id: string | null;
  shipment_emails: string | null;
}

const SQL = `
  select em.email_id, em.from_addr, em.sender_domain, em.subject, em.first_seen_at,
         er.run_id::text as run_id,
         cl.final_category, cl.human_category, cl.gen_confidence, cl.decided_by,
         cmp.status, cmp.review_reason,
         (select count(*) from core.attachments a where a.email_id = em.email_id and a.run_id = er.run_id)::text as attachments,
         (select count(*) from core.documents d where d.email_run_id = er.id)::text as documents,
         (select count(*) from core.extraction_fields ef
            join core.extractions ex on ex.id = ef.extraction_id
           where ex.email_run_id = er.id)::text as fields,
         (select count(*) from core.field_diffs fd where fd.comparison_id = cmp.id and not fd.same and not fd.missing)::text as differences,
         (select count(*) from core.comparisons c2 where c2.email_run_id = er.id)::text as comparisons,
         (select array_agg(fd.field order by fd.field) from core.field_diffs fd
           where fd.comparison_id = cmp.id and not fd.same and not fd.missing) as defect_fields,
         -- Derived, two hops: this sender's other emails that also had a defect.
         (select count(distinct er2.email_id) from core.email_runs er2
            join core.emails em2 on em2.email_id = er2.email_id
            join core.comparisons c3 on c3.email_run_id = er2.id
           where em2.sender_domain = em.sender_domain and c3.has_defect and er2.email_id <> em.email_id)::text as same_client_differed,
         -- Derived, two hops: everywhere this email's consignee was read, whoever sent it.
         (select count(distinct m2.email_run_id) from core.entity_mentions m2
           where m2.entity_id in (
             select m1.entity_id from core.entity_mentions m1
              where m1.email_run_id = er.id and m1.field = 'consignee')
             and m2.email_run_id <> er.id)::text as same_consignee,
         -- The consignment this mail is about, and how many emails are about it.
         (select se.shipment_id::text from core.shipment_emails se where se.email_id = em.email_id) as shipment_id,
         (select sh.email_count::text from core.shipment_emails se
            join core.shipments sh on sh.id = se.shipment_id
           where se.email_id = em.email_id) as shipment_emails
    from core.emails em
    join core.email_runs er on er.email_id = em.email_id
    left join core.classifications cl on cl.email_run_id = er.id
    left join core.comparisons cmp on cmp.email_run_id = er.id
   where em.email_id = $1::text and ($2::uuid is null or er.run_id = $2::uuid)
   order by er.started_at desc
   limit 1`;

function valuesOf(row: EmailRow): StoredValue[] {
  const category = row.human_category ?? row.final_category;
  return [
    { key: "id", valueType: "pk", value: row.email_id, writtenBy: "the source", tone: null },
    { key: "received_at", valueType: "date", value: row.first_seen_at.toISOString(), writtenBy: "the source", tone: null },
    { key: "sender", valueType: "abc", value: row.from_addr, writtenBy: "the source", tone: null },
    { key: "subject", valueType: "abc", value: row.subject, writtenBy: "the source", tone: null },
    { key: "category", valueType: "enum", value: category, writtenBy: row.human_category ? "a person" : "a model", tone: null },
    {
      key: "confidence",
      valueType: "1.0",
      value: row.gen_confidence === null ? null : Number(row.gen_confidence).toFixed(2),
      writtenBy: "a model",
      tone: null,
    },
    { key: "decided_by", valueType: "enum", value: row.decided_by, writtenBy: "code", tone: null },
    { key: "attachment_count", valueType: "123", value: row.attachments, writtenBy: "code", tone: null },
    {
      key: "status",
      valueType: "enum",
      value: row.status,
      writtenBy: "code",
      tone: row.status === "MISMATCH" ? "differ" : row.status === "NEEDS_REVIEW" ? "review" : row.status === "OK" ? "match" : null,
    },
    {
      key: "defect_fields",
      valueType: "list",
      value: row.defect_fields?.join(", ") ?? null,
      writtenBy: "code",
      tone: row.defect_fields?.length ? "differ" : null,
    },
    // The row the page exists to draw: a value nothing wrote is still a value,
    // and greying it says "not set" rather than "we did not look".
    {
      key: "review_reason",
      valueType: "enum",
      value: row.review_reason,
      writtenBy: row.review_reason ? "code" : "nothing wrote it",
      tone: row.review_reason ? "review" : null,
    },
  ];
}

function linksOf(row: EmailRow): ObjectLink[] {
  const link = (
    key: string,
    label: string,
    sub: string,
    count: number,
    targetType: ObjectLink["targetType"],
    derived = false,
    tone: ObjectLink["tone"] = null,
  ): ObjectLink => ({ key, label, sub, count, target: null, targetType, derived, tone: count === 0 ? null : tone });

  const shipment: ObjectLink = {
    key: "shipment",
    label: "Shipment",
    // The one link on this record that leads to a thing rather than a count:
    // the consignment this mail is about, with the other mail about it.
    sub: row.shipment_id === null ? "not read yet" : `${row.shipment_emails} email${row.shipment_emails === "1" ? "" : "s"} about it`,
    count: row.shipment_id === null ? 0 : 1,
    target: row.shipment_id === null ? null : { type: "shipment", id: row.shipment_id },
    targetType: "shipment",
    derived: false,
    tone: null,
  };

  return [
    shipment,
    link("attachments", "Attachments", "the files that arrived", Number(row.attachments), "attachment"),
    link("documents", "Documents", "one instruction, one draft", Number(row.documents), "document"),
    link("fields", "Fields", "seven read from each", Number(row.fields), "field"),
    link("differences", "Differences", row.defect_fields?.join(", ") ?? "none", Number(row.differences), "difference", false, "differ"),
    link("comparison", "Comparison", "the check itself", Number(row.comparisons), "comparison"),
    link("client", "Client", row.sender_domain, 1, "client"),
    link("same_client_differed", "Same client, differed", "derived, two hops", Number(row.same_client_differed), "email", true),
    link("same_consignee", "Same consignee, anywhere", "derived, two hops", Number(row.same_consignee), "email", true),
  ];
}

/** Null when no run has ever processed this email, or when the named run did not. */
export async function emailRecord(db: Queryable, emailId: string, runId: string | null): Promise<ObjectRecord | null> {
  const { rows } = await db.query<EmailRow>(SQL, [emailId, runId]);
  const row = rows[0];
  if (!row) return null;

  const badges: ObjectRecord["badges"] = [{ label: "Email", tone: "neutral" }];
  if (row.status === "MISMATCH") badges.push({ label: "MISMATCH", tone: "differ" });
  else if (row.status === "NEEDS_REVIEW") badges.push({ label: "NEEDS_REVIEW", tone: "review" });
  else if (row.status === "OK") badges.push({ label: "OK", tone: "match" });

  const values = valuesOf(row);
  const links = linksOf(row);

  return {
    type: "email",
    id: row.email_id,
    title: row.email_id,
    blurb: `One record of ${values.length} stored values and ${links.length} links. Every value says who wrote it.`,
    badges,
    values,
    links,
    openHref: `/runs/${row.run_id}/emails/${row.email_id}`,
  };
}
