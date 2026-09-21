import type { Queryable } from "../../db";
import { groupShipments, type ShipmentRead } from "../../pipeline/ontology";

/**
 * The consignments the mail is about, and which emails are about each.
 *
 * The grouping itself is pure and lives in pipeline/ontology/shipment-group.ts.
 * This reads what the emails state, hands it over, and writes back what comes
 * out. A regroup is whole: the alternative is deciding incrementally which
 * existing group a new email joins, and a reference that arrives on the third
 * email can merge two groups that were right when they were written.
 */

interface Row {
  email_id: string;
  oc_no: string | null;
  bl_no: string | null;
  booking_ref: string | null;
  invoice_no: string | null;
  po_no: string | null;
}

export async function regroupAll(db: Queryable): Promise<{ shipments: number; emails: number }> {
  const { rows } = await db.query<Row>(
    "select email_id, oc_no, bl_no, booking_ref, invoice_no, po_no from core.email_shipments",
  );
  const reads: ShipmentRead[] = rows.map((row) => ({
    emailId: row.email_id,
    refs: {
      oc_no: row.oc_no,
      bl_no: row.bl_no,
      booking_ref: row.booking_ref,
      invoice_no: row.invoice_no,
      po_no: row.po_no,
    },
  }));
  const groups = groupShipments(reads);

  // Upserted by key rather than rewritten, so a group whose membership did not
  // change keeps its id. A regroup that renumbered every shipment would break
  // every link to one a minute after it was made.
  for (const group of groups) {
    const key = group.emailIds.join("+");
    const { rows: made } = await db.query<{ id: string }>(
      `insert into core.shipments (key, refs, email_count) values ($1, $2::text[], $3::int)
       on conflict (key) do update set refs = excluded.refs, email_count = excluded.email_count
       returning id::text as id`,
      [key, group.refs, group.emailIds.length],
    );
    const id = made[0].id;
    await db.query(
      `insert into core.shipment_emails (email_id, shipment_id)
       select unnest($1::text[]), $2::bigint
       on conflict (email_id) do update set shipment_id = excluded.shipment_id`,
      [group.emailIds, id],
    );
  }

  // A group that no longer exists, because an email was read again and its
  // references changed. Its membership rows go with it.
  await db.query("delete from core.shipments where key <> all($1::text[])", [
    groups.map((group) => group.emailIds.join("+")),
  ]);

  await fillFromEmails(db);
  await fillFromExtractions(db);
  return { shipments: groups.length, emails: reads.length };
}

/**
 * What the group's emails agree on, taken from the newest email of the group
 * that states each column. Newest by the date the mail itself states, because
 * a later mail correcting a vessel is the answer and the first one is history.
 */
async function fillFromEmails(db: Queryable): Promise<void> {
  await db.query(`
    with ordered as (
      select se.shipment_id, s.*,
             row_number() over (partition by se.shipment_id order by s.mail_date desc nulls last, s.email_id desc) as rank
        from core.shipment_emails se join core.email_shipments s on s.email_id = se.email_id
    ),
    disputed as (
      select se.shipment_id, array_agg(distinct field order by field) as fields
        from core.shipment_emails se
        join core.email_shipments s on s.email_id = se.email_id,
             lateral unnest(s.disputed_fields) as field
       group by se.shipment_id
    ),
    rolled as (
      select shipment_id,
             (array_remove(array_agg(shipper_id order by rank), null))[1] as shipper_id,
             (array_remove(array_agg(consignee_id order by rank), null))[1] as consignee_id,
             (array_remove(array_agg(notify_party_id order by rank), null))[1] as notify_party_id,
             (array_remove(array_agg(pol_id order by rank), null))[1] as pol_id,
             (array_remove(array_agg(pod_id order by rank), null))[1] as pod_id,
             (array_remove(array_agg(carrier_id order by rank), null))[1] as carrier_id,
             (array_remove(array_agg(vessel_id order by rank), null))[1] as vessel_id,
             (array_remove(array_agg(commodity_id order by rank), null))[1] as commodity_id,
             min(mail_date) as first_mail_date,
             max(mail_date) as last_mail_date
        from ordered group by shipment_id
    )
    update core.shipments sh set
      shipper_id = r.shipper_id, consignee_id = r.consignee_id, notify_party_id = r.notify_party_id,
      pol_id = r.pol_id, pod_id = r.pod_id, carrier_id = r.carrier_id, vessel_id = r.vessel_id,
      commodity_id = r.commodity_id, first_mail_date = r.first_mail_date, last_mail_date = r.last_mail_date,
      disputed_fields = coalesce(d.fields, '{}'), updated_at = now()
      from rolled r left join disputed d on d.shipment_id = r.shipment_id
     where r.shipment_id = sh.id
  `);
}

/**
 * The four parties and the two ports, from what the extractor read.
 *
 * The shipment reader is told not to repeat the organisers' seven fields: they
 * are read from the documents by another step, and asking a second model for
 * them would be two answers to one question. So a shipment learns them here,
 * from the appearances the extraction wrote, and only where the group does not
 * already carry one from the mail's own prose.
 *
 * `not disputed` is what makes this safe. The flag is true for the BL side of
 * a field the judge called different, so filtering it out takes the
 * instruction's value and never the draft's wrong one.
 */
async function fillFromExtractions(db: Queryable): Promise<void> {
  const ROLES = [
    { column: "shipper_id", role: "shipper" },
    { column: "consignee_id", role: "consignee" },
    { column: "notify_party_id", role: "notify_party" },
    { column: "pol_id", role: "port_of_loading" },
    { column: "pod_id", role: "port_of_discharge" },
  ] as const;

  for (const { column, role } of ROLES) {
    // The column and the role are literals of a union type, never a value a
    // caller wrote; an identifier cannot be a parameter.
    await db.query(
      `update core.shipments sh set ${column} = found.entity_id, updated_at = now()
         from (
           select se.shipment_id, a.entity_id,
                  row_number() over (partition by se.shipment_id order by count(*) desc, a.entity_id) as rank
             from core.shipment_emails se
             join core.entity_appearances a on a.email_id = se.email_id
             join core.entities e on e.id = a.entity_id and e.merged_into is null
            where a.role = $1 and not a.disputed
            group by se.shipment_id, a.entity_id
         ) as found
        where found.shipment_id = sh.id and found.rank = 1 and sh.${column} is null`,
      [role],
    );
  }
}
