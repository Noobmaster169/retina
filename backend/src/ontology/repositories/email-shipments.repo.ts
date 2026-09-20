import type { ComparisonField } from "../../contracts";
import type { Queryable } from "../../db";
import type { ShipmentColumn, ShipmentDraft } from "../../pipeline/ontology";

/**
 * One shipment as one email states it.
 *
 * Written by the ontology job and replaced wholesale when that job runs again,
 * which is what makes a rerun after a reviewer's correction cheap: the row is
 * derived from the reading and the settled fields, and nothing else reads back
 * from it.
 */

/** Every column the draft can fill, in the order the insert names them. */
const COLUMNS = [
  "oc_no", "bl_no", "booking_ref", "invoice_no", "po_no",
  "voyage", "hs_code", "container_count", "container_type", "gross_weight_kg",
  "trade_term", "payment_term", "bl_type", "freight", "mail_date", "mail_date_quote",
] as const;

const ENTITY_COLUMNS: ShipmentColumn[] = [
  "shipper_id", "consignee_id", "notify_party_id", "pol_id", "pod_id", "carrier_id", "vessel_id", "commodity_id",
];

function valuesOf(draft: ShipmentDraft): unknown[] {
  return [
    draft.ocNo, draft.blNo, draft.bookingRef, draft.invoiceNo, draft.poNo,
    draft.voyage, draft.hsCode, draft.containerCount, draft.containerType, draft.grossWeightKg,
    draft.tradeTerm, draft.paymentTerm, draft.blType, draft.freight, draft.mailDate, draft.mailDateQuote,
  ];
}

export interface ShipmentWrite {
  emailId: string;
  emailRunId: number | null;
  draft: ShipmentDraft;
  /** The id each entity column resolved to. A column with no id stays null. */
  links: Partial<Record<ShipmentColumn, number>>;
}

/**
 * One row per email, replaced in full.
 *
 * `on conflict do update` rather than delete and insert, so the row's id never
 * moves and a reader between the two never sees an email with no shipment.
 */
export async function replaceForEmail(tx: Queryable, write: ShipmentWrite): Promise<void> {
  const entityValues = ENTITY_COLUMNS.map((column) => write.links[column] ?? null);
  const names = [...COLUMNS, ...ENTITY_COLUMNS, "disputed_fields", "attributes", "email_run_id"];
  const values = [...valuesOf(write.draft), ...entityValues, write.draft.disputedFields, JSON.stringify(write.draft.attributes), write.emailRunId];
  const placeholders = names.map((_, at) => `$${at + 2}`);

  await tx.query(
    `insert into core.email_shipments (email_id, ${names.join(", ")})
     values ($1::text, ${placeholders.join(", ")})
     on conflict (email_id) do update set
       ${names.map((name, at) => `${name} = $${at + 2}`).join(", ")},
       updated_at = now()`,
    [write.emailId, ...values],
  );
}

export interface StoredShipment {
  emailId: string;
  ocNo: string | null;
  blNo: string | null;
  mailDate: string | null;
  disputedFields: ComparisonField[];
}

export async function forEmail(db: Queryable, emailId: string): Promise<StoredShipment | null> {
  const { rows } = await db.query<{ email_id: string; oc_no: string | null; bl_no: string | null; mail_date: Date | null; disputed_fields: ComparisonField[] }>(
    "select email_id, oc_no, bl_no, mail_date, disputed_fields from core.email_shipments where email_id = $1::text",
    [emailId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    emailId: row.email_id,
    ocNo: row.oc_no,
    blNo: row.bl_no,
    mailDate: row.mail_date === null ? null : row.mail_date.toISOString().slice(0, 10),
    disputedFields: row.disputed_fields,
  };
}

/** Every finished email with no shipment row yet. What `pnpm ontology:backfill` enqueues. */
export async function withoutShipment(db: Queryable, limit: number): Promise<{ emailId: string; emailRunId: number }[]> {
  const { rows } = await db.query<{ email_id: string; id: string }>(
    `select distinct on (er.email_id) er.email_id, er.id::text as id
       from core.email_runs er
      where er.stage in ('done', 'review')
        and not exists (select 1 from core.email_shipments s where s.email_id = er.email_id)
      order by er.email_id, er.id desc
      limit $1::int`,
    [limit],
  );
  return rows.map((row) => ({ emailId: row.email_id, emailRunId: Number(row.id) }));
}
