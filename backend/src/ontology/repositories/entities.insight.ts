import type { Queryable } from "../../db";
import type { EntityKind } from "../../contracts";
import { type InsightExtras, NO_EXTRAS } from "../../pipeline/ontology";

/**
 * The facts a kind needs that the dossier does not carry: a carrier's ships, a
 * vessel's voyages, a commodity's customs codes, and how much of what a thing
 * appeared in was disputed.
 *
 * Bounded like the dossier's own queries, and only the ones the kind uses: a
 * person costs two queries to open and a carrier four, rather than every kind
 * paying for every other kind's facets.
 */

/** Past this, more lines tell a reader nothing the counts do not. */
const LIMIT = 10;

async function scale(db: Queryable, entityId: string): Promise<{ appearances: number; disputed: number }> {
  const { rows } = await db.query<{ appearances: string; disputed: string }>(
    `select count(*)::text as appearances,
            count(*) filter (where disputed)::text as disputed
       from core.entity_appearances where entity_id = $1::bigint`,
    [entityId],
  );
  return { appearances: Number(rows[0].appearances), disputed: Number(rows[0].disputed) };
}

/**
 * The things on the other side of a shipment column from this one: a carrier's
 * vessels, a vessel's carrier. The two column names are interpolated because
 * an identifier cannot be a parameter; both are literals of a union type and
 * neither is ever a value a caller wrote.
 */
async function across(
  db: Queryable,
  entityId: string,
  mine: "carrier_id" | "vessel_id" | "commodity_id",
  theirs: "carrier_id" | "vessel_id",
): Promise<{ id: string; name: string; emails: number }[]> {
  const { rows } = await db.query<{ id: string; canonical: string; emails: string }>(
    `select e.id::text as id, e.canonical, count(*)::text as emails
       from core.email_shipments s
       join core.entities e on e.id = s.${theirs} and e.merged_into is null
      where s.${mine} = $1::bigint
      group by e.id, e.canonical
      order by count(*) desc, e.canonical
      limit $2::int`,
    [entityId, LIMIT],
  );
  return rows.map((row) => ({ id: row.id, name: row.canonical, emails: Number(row.emails) }));
}

async function voyages(db: Queryable, entityId: string): Promise<InsightExtras["voyages"]> {
  const { rows } = await db.query<{ voyage: string; from_port: string | null; to_port: string | null; mail_date: Date | null }>(
    `select s.voyage, pol.canonical as from_port, pod.canonical as to_port, s.mail_date
       from core.email_shipments s
       left join core.entities pol on pol.id = s.pol_id
       left join core.entities pod on pod.id = s.pod_id
      where s.vessel_id = $1::bigint and s.voyage is not null
      order by s.mail_date desc nulls last
      limit $2::int`,
    [entityId, LIMIT],
  );
  return rows.map((row) => ({
    voyage: row.voyage,
    lane: row.from_port && row.to_port ? `${row.from_port} to ${row.to_port}` : null,
    mailDate: row.mail_date === null ? null : row.mail_date.toISOString().slice(0, 10),
  }));
}

async function hsCodes(db: Queryable, entityId: string): Promise<InsightExtras["hsCodes"]> {
  const { rows } = await db.query<{ hs_code: string; emails: string }>(
    `select hs_code, count(*)::text as emails
       from core.email_shipments
      where commodity_id = $1::bigint and hs_code is not null
      group by hs_code order by count(*) desc limit $2::int`,
    [entityId, LIMIT],
  );
  return rows.map((row) => ({ code: row.hs_code, emails: Number(row.emails) }));
}

/** What a carrier's paperwork is numbered like. The value as written, never a pattern inferred from it. */
async function references(db: Queryable, entityId: string): Promise<InsightExtras["references"]> {
  const { rows } = await db.query<{ bl_no: string | null; booking_ref: string | null }>(
    `select bl_no, booking_ref from core.email_shipments
      where carrier_id = $1::bigint and (bl_no is not null or booking_ref is not null)
      order by updated_at desc limit $2::int`,
    [entityId, LIMIT],
  );
  const found: InsightExtras["references"] = [];
  for (const row of rows) {
    if (row.bl_no) found.push({ label: "bill of lading", value: row.bl_no });
    if (row.booking_ref) found.push({ label: "booking", value: row.booking_ref });
  }
  return found.slice(0, LIMIT);
}

async function totals(db: Queryable, entityId: string): Promise<InsightExtras["totals"]> {
  const { rows } = await db.query<{ containers: string | null; weight: string | null }>(
    `select sum(container_count)::text as containers, sum(gross_weight_kg)::text as weight
       from core.email_shipments where commodity_id = $1::bigint`,
    [entityId],
  );
  const row = rows[0];
  return {
    containers: row?.containers ? Number(row.containers) : null,
    grossWeightKg: row?.weight ? Number(row.weight) : null,
  };
}

export async function loadExtras(db: Queryable, entityId: string, kind: EntityKind): Promise<InsightExtras> {
  const counted = await scale(db, entityId);
  if (kind === "carrier") {
    const [vessels, refs] = await Promise.all([across(db, entityId, "carrier_id", "vessel_id"), references(db, entityId)]);
    return { ...NO_EXTRAS, ...counted, vessels, references: refs };
  }
  if (kind === "vessel") {
    const [carriers, sailed] = await Promise.all([across(db, entityId, "vessel_id", "carrier_id"), voyages(db, entityId)]);
    return { ...NO_EXTRAS, ...counted, carriers, voyages: sailed };
  }
  if (kind === "commodity") {
    const [codes, summed] = await Promise.all([hsCodes(db, entityId), totals(db, entityId)]);
    return { ...NO_EXTRAS, ...counted, hsCodes: codes, totals: summed };
  }
  return { ...NO_EXTRAS, ...counted };
}
