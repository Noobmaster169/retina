import type { Counterpart, ObjectType } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Things seen beside one thing, counted in distinct emails.
 *
 * All three read `core.entity_appearances`, so a company's ports count the
 * documents its name was read from and the mail that named it, under one
 * rule. A disputed appearance is left out: a port that exists only on a wrong
 * draft is not a lane the company ships on.
 */

interface Row {
  id: string;
  kind: ObjectType;
  canonical: string;
  n: string;
}

async function beside(db: Queryable, entityId: string, roles: string[], kind: string): Promise<Counterpart[]> {
  const { rows } = await db.query<Row>(
    `with mine as (select distinct email_id from core.entity_appearances where entity_id = $1::bigint and not disputed)
     select e.id::text as id, e.kind, e.canonical, count(distinct a.email_id)::text as n
       from core.entity_appearances a
       join mine on mine.email_id = a.email_id
       join core.entities e on e.id = a.entity_id and e.merged_into is null
      where a.entity_id <> $1::bigint and a.role = any($2::text[]) and e.kind = $3::text and not a.disputed
      group by e.id, e.kind, e.canonical
      order by count(distinct a.email_id) desc, e.canonical asc
      limit 50`,
    [entityId, roles, kind],
  );
  return rows.map((row) => ({ id: row.id, type: row.kind, name: row.canonical, count: Number(row.n) }));
}

/** The ports a company's shipments load at or discharge to. */
export function ports(db: Queryable, partyId: string): Promise<Counterpart[]> {
  return beside(db, partyId, ["port_of_loading", "port_of_discharge"], "port");
}

/** The companies whose shipments touch a port, in any of the three roles. */
export function parties(db: Queryable, portId: string): Promise<Counterpart[]> {
  return beside(db, portId, ["shipper", "consignee", "notify_party", "on_behalf_of"], "party");
}

/** The people who sent, signed or were written to on a company's mail. */
export function people(db: Queryable, partyId: string): Promise<Counterpart[]> {
  return beside(db, partyId, ["sender", "signer", "addressee"], "person");
}
