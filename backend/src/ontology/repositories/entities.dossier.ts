import type { EntityKind } from "../../contracts";
import type { Queryable } from "../../db";
import { buildDossier, type Dossier, type DossierInput, LIMITS } from "../../pipeline/ontology";

/**
 * Everything the profile step is shown about one thing, each part read with
 * its own bounded query.
 *
 * Bounded in SQL and not in memory: the whole point of a fixed-size dossier is
 * that a thing named in two hundred thousand emails costs the same to profile
 * as one named in three, and reading every appearance to then keep ten would
 * give that up at the first query.
 */

/** One over each limit, so the renderer can say "and N more" truthfully without counting the whole table. */
const probe = (limit: number) => limit + 1;

/**
 * One dossier, two readers. `loadDossierInput` is the facts; `loadDossier`
 * renders them for the profile prompt and the insight route hands the same
 * facts to a person. A second set of queries for the page would be a second
 * answer to "what do we know about this thing", and the two would drift.
 */
export async function loadDossier(db: Queryable, entityId: string): Promise<Dossier | null> {
  const input = await loadDossierInput(db, entityId);
  return input === null ? null : buildDossier(input);
}

export async function loadDossierInput(db: Queryable, entityId: string): Promise<DossierInput | null> {
  const head = await db.query<{ kind: EntityKind; canonical: string }>(
    "select kind, canonical from core.entities where id = $1::bigint and merged_into is null",
    [entityId],
  );
  if (!head.rows[0]) return null;

  const names = await db.query<{ value: string; seen_count: number; joined_by: string }>(
    `select value, seen_count, joined_by from core.entity_names
      where entity_id = $1::bigint order by seen_count desc, value asc limit $2::int`,
    [entityId, probe(LIMITS.names)],
  );

  const roles = await db.query<{ role: string; appearances: string; emails: string }>(
    `select role, count(*)::text as appearances, count(distinct email_id)::text as emails
       from core.entity_appearances where entity_id = $1::bigint
      group by role order by count(*) desc limit $2::int`,
    [entityId, probe(LIMITS.roles)],
  );

  // The things this one shares an email with, by how many emails they share.
  const counterparties = await db.query<{ id: string; canonical: string; kind: string; emails: string }>(
    `select e.id::text as id, e.canonical, e.kind, count(distinct other.email_id)::text as emails
       from core.entity_appearances mine
       join core.entity_appearances other on other.email_id = mine.email_id and other.entity_id <> mine.entity_id
       join core.entities e on e.id = other.entity_id and e.merged_into is null
      where mine.entity_id = $1::bigint
      group by e.id, e.canonical, e.kind
      order by count(distinct other.email_id) desc, e.canonical
      limit $2::int`,
    [entityId, probe(LIMITS.counterparties)],
  );

  const lanes = await db.query<{ from_id: string; from_port: string; to_id: string; to_port: string; emails: string }>(
    `select pol.id::text as from_id, pol.canonical as from_port,
            pod.id::text as to_id, pod.canonical as to_port, count(*)::text as emails
       from core.email_shipments s
       join core.entities pol on pol.id = s.pol_id
       join core.entities pod on pod.id = s.pod_id
      where exists (select 1 from core.entity_appearances a where a.email_id = s.email_id and a.entity_id = $1::bigint)
      group by pol.id, pol.canonical, pod.id, pod.canonical
      order by count(*) desc limit $2::int`,
    [entityId, probe(LIMITS.lanes)],
  );

  const goods = await db.query<{ description: string; emails: string }>(
    `select s.attributes->>'goods' as description, count(*)::text as emails
       from core.email_shipments s
      where s.attributes->>'goods' is not null
        and exists (select 1 from core.entity_appearances a where a.email_id = s.email_id and a.entity_id = $1::bigint)
      group by s.attributes->>'goods'
      order by count(*) desc limit $2::int`,
    [entityId, probe(LIMITS.goods)],
  );

  const addresses = await db.query<{ address: string }>(
    `select distinct address from core.entity_sightings
      where entity_id = $1::bigint and address is not null order by address limit $2::int`,
    [entityId, probe(LIMITS.addresses)],
  );

  const quotes = await db.query<{ source_quote: string }>(
    `select source_quote from core.entity_sightings
      where entity_id = $1::bigint order by created_at desc limit $2::int`,
    [entityId, probe(LIMITS.quotes)],
  );

  const totals = await db.query<{ emails: string; first: Date | null; last: Date | null }>(
    `select (select count(distinct email_id)::text from core.entity_appearances where entity_id = $1::bigint) as emails,
            (select min(s.mail_date) from core.email_shipments s
              where exists (select 1 from core.entity_appearances a where a.email_id = s.email_id and a.entity_id = $1::bigint)) as first,
            (select max(s.mail_date) from core.email_shipments s
              where exists (select 1 from core.entity_appearances a where a.email_id = s.email_id and a.entity_id = $1::bigint)) as last`,
    [entityId],
  );
  const total = totals.rows[0];

  return {
    kind: head.rows[0].kind,
    canonical: head.rows[0].canonical,
    names: names.rows.map((row) => ({ value: row.value, seenCount: row.seen_count, joinedBy: row.joined_by })),
    roles: roles.rows.map((row) => ({ role: row.role, appearances: Number(row.appearances), emails: Number(row.emails) })),
    counterparties: counterparties.rows.map((row) => ({
      id: row.id,
      name: row.canonical,
      kind: row.kind,
      emails: Number(row.emails),
    })),
    lanes: lanes.rows.map((row) => ({
      fromId: row.from_id,
      from: row.from_port,
      toId: row.to_id,
      to: row.to_port,
      emails: Number(row.emails),
    })),
    goods: goods.rows.map((row) => ({ description: row.description, emails: Number(row.emails) })),
    addresses: addresses.rows.map((row) => row.address),
    quotes: quotes.rows.map((row) => row.source_quote),
    emails: Number(total.emails),
    firstMailDate: total.first === null ? null : total.first.toISOString().slice(0, 10),
    lastMailDate: total.last === null ? null : total.last.toISOString().slice(0, 10),
  };
}
