import type { Queryable } from "../../db";
import type { SightingRole } from "../../pipeline/ontology";

/**
 * Where a thing was seen somewhere no extraction field reaches.
 *
 * Per email and not per run: no extraction produced these, and re-running a
 * comparison does not change what a subject line says. One email's job
 * replaces that email's rows and leaves every other email alone, which is the
 * same rule the pipeline follows for a stage.
 */

export interface NewSighting {
  entityId: number;
  role: SightingRole;
  source: "subject" | "body" | "header" | "document";
  surface: string;
  address: string | null;
  sourceQuote: string;
  ambiguous: boolean;
}

export async function replaceForEmail(
  tx: Queryable,
  emailId: string,
  emailRunId: number | null,
  sightings: NewSighting[],
): Promise<number> {
  await tx.query("delete from core.entity_sightings where email_id = $1::text", [emailId]);
  for (const sighting of sightings) {
    // The unique key is (email_id, role, source, entity_id): two readings of
    // one name in one place are one sighting, and the first one's quote stands.
    await tx.query(
      `insert into core.entity_sightings (entity_id, email_id, email_run_id, role, source, surface, address, source_quote, ambiguous)
       values ($1::bigint, $2::text, $3::bigint, $4::text, $5::text, $6::text, $7::text, $8::text, $9::boolean)
       on conflict (email_id, role, source, entity_id) do nothing`,
      [sighting.entityId, emailId, emailRunId, sighting.role, sighting.source, sighting.surface, sighting.address, sighting.sourceQuote, sighting.ambiguous],
    );
  }
  return sightings.length;
}

export interface Appearance {
  emailId: string;
  role: string;
  source: string;
  surface: string;
  address: string | null;
  disputed: boolean;
}

/**
 * Everywhere one thing appeared, from either table.
 *
 * `disputed` is true for the draft bill's side of a field the judge called
 * different, so a question about where cargo actually went can leave it out.
 */
export async function appearancesOf(db: Queryable, entityId: string, limit = 200): Promise<Appearance[]> {
  const { rows } = await db.query<{ email_id: string; role: string; source: string; surface: string; address: string | null; disputed: boolean }>(
    `select email_id, role, source, surface, address, disputed
       from core.entity_appearances
      where entity_id = $1::bigint
      order by email_id, role
      limit $2::int`,
    [entityId, limit],
  );
  return rows.map((row) => ({
    emailId: row.email_id,
    role: row.role,
    source: row.source,
    surface: row.surface,
    address: row.address,
    disputed: row.disputed,
  }));
}

/** How often each role this thing has played, across both tables. The dossier's first section. */
export async function rolesOf(db: Queryable, entityId: string): Promise<{ role: string; appearances: number; emails: number }[]> {
  const { rows } = await db.query<{ role: string; appearances: string; emails: string }>(
    `select role, count(*)::text as appearances, count(distinct email_id)::text as emails
       from core.entity_appearances
      where entity_id = $1::bigint
      group by role
      order by count(*) desc`,
    [entityId],
  );
  return rows.map((row) => ({ role: row.role, appearances: Number(row.appearances), emails: Number(row.emails) }));
}

/** The distinct addresses this thing has been written with. An address belongs to a sighting, so a thing may have several. */
export async function addressesOf(db: Queryable, entityId: string, limit = 10): Promise<string[]> {
  const { rows } = await db.query<{ address: string }>(
    `select distinct address from core.entity_sightings
      where entity_id = $1::bigint and address is not null
      order by address limit $2::int`,
    [entityId, limit],
  );
  return rows.map((row) => row.address);
}
