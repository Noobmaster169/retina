import type { ShipmentDetail, ShipmentList, ShipmentQuery, ShipmentRef, ShipmentRow } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Shipments read back for the business pages. The write side is
 * email-shipments.repo.ts; this file only selects, and every party and port
 * comes out as a reference to the resolved thing so a page can link to it.
 */

interface Row {
  email_id: string;
  subject: string;
  run_id: string | null;
  outcome: string | null;
  oc_no: string | null;
  bl_no: string | null;
  booking_ref: string | null;
  invoice_no: string | null;
  po_no: string | null;
  mail_date: string | null;
  mail_date_quote: string | null;
  voyage: string | null;
  hs_code: string | null;
  container_count: number | null;
  container_type: string | null;
  gross_weight_kg: string | null;
  trade_term: string | null;
  payment_term: string | null;
  bl_type: string | null;
  freight: string | null;
  disputed_fields: string[];
  attributes: Record<string, string>;
  refs: Record<string, ShipmentRef | null>;
}

const REF_COLUMNS = ["shipper", "consignee", "notify_party", "pol", "pod", "carrier", "vessel", "commodity"] as const;

/** The date as text: pg hands a `date` back as a local-midnight Date, and toISOString would move it a day. */
const MAIL_DATE = "to_char(s.mail_date, 'YYYY-MM-DD')";

/** One jsonb of `{ column: { id, name } | null }`, so the select stays one row per shipment. */
const REFS = REF_COLUMNS.map(
  (column) =>
    `'${column}', (select jsonb_build_object('id', e.id::text, 'name', e.canonical) from core.entities e where e.id = s.${column}_id)`,
).join(", ");

const SELECT = `
  select s.email_id, em.subject, er.run_id::text as run_id, er.outcome,
         s.oc_no, s.bl_no, s.booking_ref, s.invoice_no, s.po_no,
         ${MAIL_DATE} as mail_date, s.mail_date_quote,
         s.voyage, s.hs_code, s.container_count, s.container_type, s.gross_weight_kg::text as gross_weight_kg,
         s.trade_term, s.payment_term, s.bl_type, s.freight, s.disputed_fields, s.attributes,
         jsonb_build_object(${REFS}) as refs
    from core.email_shipments s
    join core.emails em on em.email_id = s.email_id
    left join core.email_runs er on er.id = s.email_run_id`;

function toRow(row: Row): ShipmentRow {
  return {
    emailId: row.email_id,
    subject: row.subject,
    runId: row.run_id,
    outcome: row.outcome,
    ocNo: row.oc_no,
    blNo: row.bl_no,
    bookingRef: row.booking_ref,
    mailDate: row.mail_date,
    shipper: row.refs.shipper,
    consignee: row.refs.consignee,
    notifyParty: row.refs.notify_party,
    pol: row.refs.pol,
    pod: row.refs.pod,
    carrier: row.refs.carrier,
    vessel: row.refs.vessel,
    commodity: row.refs.commodity,
    voyage: row.voyage,
    containerCount: row.container_count,
    containerType: row.container_type,
    grossWeightKg: row.gross_weight_kg === null ? null : Number(row.gross_weight_kg),
    disputedFields: row.disputed_fields,
  };
}

/** The where clause a query asks for, as SQL and its parameters, numbered from `$1`. */
function filters(query: ShipmentQuery): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const next = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.partyId) {
    const p = next(query.partyId);
    clauses.push(`(s.shipper_id = ${p}::bigint or s.consignee_id = ${p}::bigint or s.notify_party_id = ${p}::bigint)`);
  }
  if (query.portId) {
    const p = next(query.portId);
    clauses.push(`(s.pol_id = ${p}::bigint or s.pod_id = ${p}::bigint)`);
  }
  if (query.disputed === "true") clauses.push("cardinality(s.disputed_fields) > 0");
  if (query.disputed === "false") clauses.push("cardinality(s.disputed_fields) = 0");
  if (query.q) {
    const p = next(`${query.q}%`);
    clauses.push(`(s.oc_no ilike ${p} or s.bl_no ilike ${p} or s.booking_ref ilike ${p})`);
  }
  return { where: clauses.length ? `where ${clauses.join(" and ")}` : "", params };
}

/** Newest stated mail date first, then newest read; an email that states no date sorts last. */
export async function list(db: Queryable, query: ShipmentQuery): Promise<ShipmentList> {
  const { where, params } = filters(query);
  const offset = (query.page - 1) * query.pageSize;
  const [{ rows }, count] = await Promise.all([
    db.query<Row>(
      `${SELECT} ${where} order by s.mail_date desc nulls last, s.updated_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, offset],
    ),
    db.query<{ n: string }>(`select count(*)::text as n from core.email_shipments s ${where}`, params),
  ]);
  return { shipments: rows.map(toRow), total: Number(count.rows[0].n) };
}

export async function detail(db: Queryable, emailId: string): Promise<ShipmentDetail | null> {
  const { rows } = await db.query<Row>(`${SELECT} where s.email_id = $1::text`, [emailId]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...toRow(row),
    invoiceNo: row.invoice_no,
    poNo: row.po_no,
    hsCode: row.hs_code,
    tradeTerm: row.trade_term,
    paymentTerm: row.payment_term,
    blType: row.bl_type,
    freight: row.freight,
    mailDateQuote: row.mail_date_quote,
    attributes: row.attributes,
    caseHref: row.run_id ? `/runs/${row.run_id}/emails/${row.email_id}` : null,
  };
}
