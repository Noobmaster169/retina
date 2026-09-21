import type { ComparisonField, ConsignmentDetail, ConsignmentParty, ConsignmentRow, ConsignmentStatement } from "../../contracts";
import type { Queryable } from "../../db";
import { readRef } from "../../pipeline/ontology";

/**
 * Shipments as a page reads them. Its own file beside shipments.repo.ts, which
 * only groups and writes: the two have no query in common.
 */

/** The roles a shipment holds, in the order a bill of lading prints them. */
const ROLES = [
  { column: "shipper_id", role: "shipper", kind: "party", field: "shipper" },
  { column: "consignee_id", role: "consignee", kind: "party", field: "consignee" },
  { column: "notify_party_id", role: "notify party", kind: "party", field: "notify_party" },
  { column: "pol_id", role: "loads at", kind: "port", field: "port_of_loading" },
  { column: "pod_id", role: "discharges at", kind: "port", field: "port_of_discharge" },
  { column: "carrier_id", role: "carrier", kind: "carrier", field: null },
  { column: "vessel_id", role: "vessel", kind: "vessel", field: null },
  { column: "commodity_id", role: "cargo", kind: "commodity", field: null },
] as const;

interface RowShape {
  id: string;
  refs: string[];
  from_port: string | null;
  to_port: string | null;
  consignee: string | null;
  commodity: string | null;
  email_count: number;
  last_mail_date: Date | null;
  disputed_fields: string[];
}

const SELECT = `select sh.id::text as id, sh.refs, sh.email_count, sh.last_mail_date, sh.disputed_fields,
       pol.canonical as from_port, pod.canonical as to_port,
       cons.canonical as consignee, com.canonical as commodity
  from core.shipments sh
  left join core.entities pol on pol.id = sh.pol_id
  left join core.entities pod on pod.id = sh.pod_id
  left join core.entities cons on cons.id = sh.consignee_id
  left join core.entities com on com.id = sh.commodity_id`;

function toRow(row: RowShape): ConsignmentRow {
  return {
    id: row.id,
    refs: row.refs.map(readRef),
    lane: row.from_port && row.to_port ? { from: row.from_port, to: row.to_port } : null,
    consignee: row.consignee,
    commodity: row.commodity,
    emails: row.email_count,
    lastMailDate: row.last_mail_date === null ? null : row.last_mail_date.toISOString().slice(0, 10),
    disputedFields: row.disputed_fields as ComparisonField[],
  };
}

export async function list(db: Queryable, limit = 200): Promise<{ shipments: ConsignmentRow[]; total: number }> {
  const counted = await db.query<{ total: string }>("select count(*)::text as total from core.shipments");
  const { rows } = await db.query<RowShape>(
    `${SELECT} order by sh.last_mail_date desc nulls last, sh.id desc limit $1::int`,
    [limit],
  );
  return { shipments: rows.map(toRow), total: Number(counted.rows[0].total) };
}

async function parties(db: Queryable, shipmentId: string, disputed: string[]): Promise<ConsignmentParty[]> {
  const columns = ROLES.map((role) => `sh.${role.column}`).join(", ");
  const { rows } = await db.query<Record<string, string | null>>(
    `select ${columns},
            ${ROLES.map((role) => `e_${role.column}.canonical as name_${role.column}`).join(", ")}
       from core.shipments sh
       ${ROLES.map((role) => `left join core.entities e_${role.column} on e_${role.column}.id = sh.${role.column}`).join("\n       ")}
      where sh.id = $1::bigint`,
    [shipmentId],
  );
  const row = rows[0];
  if (!row) return [];
  return ROLES.flatMap((role) => {
    const id = row[role.column];
    const name = row[`name_${role.column}`];
    if (id === null || name === null || id === undefined || name === undefined) return [];
    return [{ role: role.role, kind: role.kind, id: String(id), name, disputed: role.field !== null && disputed.includes(role.field) }];
  });
}

async function statements(db: Queryable, shipmentId: string): Promise<ConsignmentStatement[]> {
  const { rows } = await db.query<{
    email_id: string;
    subject: string;
    mail_date: Date | null;
    mail_date_quote: string | null;
    attributes: Record<string, unknown>;
    voyage: string | null;
    hs_code: string | null;
    container_count: number | null;
    gross_weight_kg: string | null;
    trade_term: string | null;
    payment_term: string | null;
    bl_type: string | null;
    freight: string | null;
    disputed_fields: string[];
  }>(
    `select s.email_id, e.subject, s.mail_date, s.mail_date_quote, s.attributes, s.voyage, s.hs_code,
            s.container_count, s.gross_weight_kg, s.trade_term, s.payment_term, s.bl_type, s.freight,
            s.disputed_fields
       from core.shipment_emails se
       join core.email_shipments s on s.email_id = se.email_id
       join core.emails e on e.email_id = s.email_id
      where se.shipment_id = $1::bigint
      order by s.mail_date desc nulls last, s.email_id desc`,
    [shipmentId],
  );
  return rows.map((row) => ({
    emailId: row.email_id,
    subject: row.subject,
    mailDate: row.mail_date === null ? null : row.mail_date.toISOString().slice(0, 10),
    mailDateQuote: row.mail_date_quote,
    attributes: Object.fromEntries(
      Object.entries(row.attributes ?? {})
        .filter(([, value]) => typeof value === "string" && value.length > 0)
        .map(([key, value]) => [key, String(value)]),
    ),
    voyage: row.voyage,
    hsCode: row.hs_code,
    containerCount: row.container_count,
    grossWeightKg: row.gross_weight_kg === null ? null : Number(row.gross_weight_kg),
    tradeTerm: row.trade_term,
    paymentTerm: row.payment_term,
    blType: row.bl_type,
    freight: row.freight,
    disputedFields: row.disputed_fields as ComparisonField[],
  }));
}

export async function find(db: Queryable, shipmentId: string): Promise<ConsignmentDetail | null> {
  const { rows } = await db.query<RowShape>(`${SELECT} where sh.id = $1::bigint`, [shipmentId]);
  const row = rows[0];
  if (!row) return null;
  const [held, said] = await Promise.all([parties(db, shipmentId, row.disputed_fields), statements(db, shipmentId)]);
  return { row: toRow(row), parties: held, statements: said };
}

export async function count(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ total: string }>("select count(*)::text as total from core.shipments");
  return Number(rows[0].total);
}
