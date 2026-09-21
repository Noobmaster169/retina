import type { AttributeSource } from "../../contracts";
import type { Queryable } from "../../db";
import { countryByName } from "../../reference/countries";
import { locatePort } from "../../reference/ports";
import { mergeAttributes } from "./entities.profile";

/**
 * What the reference lists know about a thing, written the moment it exists.
 *
 * A port is placed by its name: country, code, coordinates, region. A company
 * gets its country code from the country its profile names. Both are written
 * with source `reference`, which a profile rewrite never touches and a
 * person's edit may replace.
 */

const REFERENCE: AttributeSource = { source: "reference", confidence: null, llmCallId: null };

function sources(keys: string[]): Record<string, AttributeSource> {
  return Object.fromEntries(keys.map((key) => [key, REFERENCE]));
}

/**
 * The keys a person has settled, which the reference list leaves alone.
 *
 * A placement used to be written whole, which was invisible while it only ever
 * ran on a thing that had none of these. It stops being invisible the moment a
 * port is placed a second time, so the rule the edit route documents is
 * enforced here rather than assumed.
 */
async function settledByHand(tx: Queryable, id: string): Promise<Set<string>> {
  const { rows } = await tx.query<{ key: string }>(
    `select key from core.entities, jsonb_each(attributes_source) as each(key, value)
      where id = $1::bigint and value->>'source' = 'human'`,
    [id],
  );
  return new Set(rows.map((row) => row.key));
}

/** Places a port from its name. Returns false when the reference lists hold no such port. */
export async function locateEntity(tx: Queryable, id: string, kind: string, canonical: string): Promise<boolean> {
  if (kind !== "port") return false;
  const located = locatePort(canonical);
  if (!located) return false;
  const attributes: Record<string, string | null> = {
    country: located.country.name,
    countryCode: located.country.code,
    lat: String(located.lat),
    lon: String(located.lon),
    region: located.country.region,
    subregion: located.country.subregion,
  };
  if (located.locode) attributes.locode = located.locode;
  for (const key of await settledByHand(tx, id)) delete attributes[key];
  if (Object.keys(attributes).length === 0) return true;
  await mergeAttributes(tx, id, attributes, sources(Object.keys(attributes)));
  return true;
}

/**
 * The live port already placed at this UN/LOCODE, if there is one.
 *
 * What makes a new spelling of a known port cost no model call and create no
 * second row: the resolver reads the code off the reference list for the
 * spelling, and this says which thing already holds it.
 */
export async function holderOfLocode(db: Queryable, locode: string): Promise<number | null> {
  const { rows } = await db.query<{ id: string }>(
    `select id::text as id from core.entities
      where kind = 'port' and merged_into is null and attributes->>'locode' = $1::text
      order by mention_count + sighting_count desc, id asc limit 1`,
    [locode],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** A company's country code from the country name its profile carries. Null when the name is not a country the list knows. */
export function countryCodeFor(attributes: Record<string, string | null>): string | null {
  return countryByName(attributes.country)?.code ?? null;
}

export interface Unplaced {
  id: string;
  kind: string;
  canonical: string;
  attributes: Record<string, string | null>;
}

/**
 * Every live port without coordinates or a country code, and every live
 * company with a country and no code. What `pnpm ontology:locate` walks.
 *
 * `again` widens it to the ports already placed as well, which is what `--all`
 * is for: skipping them is what makes the default cheap, and it is also what
 * pins a port to the answer the lookup gave on the day it was first seen, so
 * an improvement to the lookup reaches nothing without it. Companies are
 * unaffected either way, since their code comes from the country their profile
 * names rather than from the lookup.
 */
export async function unlocated(db: Queryable, again = false): Promise<Unplaced[]> {
  const { rows } = await db.query<Unplaced>(
    `select id::text as id, kind, canonical, attributes
       from core.entities
      where merged_into is null
        and ((kind = 'port' and ($1::boolean or attributes->>'lat' is null or attributes->>'countryCode' is null))
          or (kind = 'party' and attributes->>'country' is not null and attributes->>'countryCode' is null))
      order by kind, canonical`,
    [again],
  );
  return rows;
}
