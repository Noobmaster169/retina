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
  await mergeAttributes(tx, id, attributes, sources(Object.keys(attributes)));
  return true;
}

/** A company's country code from the country name its profile carries. Null when the name is not a country the list knows. */
export function countryCodeFor(attributes: Record<string, string | null>): string | null {
  return countryByName(attributes.country)?.code ?? null;
}

/** Every live port without coordinates, and every live company with a country and no code. What `pnpm ontology:locate` walks. */
export async function unlocated(db: Queryable): Promise<{ id: string; kind: string; canonical: string; attributes: Record<string, string | null> }[]> {
  const { rows } = await db.query<{ id: string; kind: string; canonical: string; attributes: Record<string, string | null> }>(
    `select id::text as id, kind, canonical, attributes
       from core.entities
      where merged_into is null
        and ((kind = 'port' and attributes->>'lat' is null)
          or (kind = 'party' and attributes->>'country' is not null and attributes->>'countryCode' is null))
      order by kind, canonical`,
  );
  return rows;
}
