import { z } from "zod";

import { AttributeSource, type StoredProfile } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * The profile columns of a thing: what it is, rather than how it was written.
 *
 * Its own file because it is its own lifecycle. The resolver never touches
 * these columns and the profile job never touches the resolver's, so the two
 * can run in any order without either overwriting the other.
 */

/**
 * What the profile step wrote about a thing, or null before it has run once.
 *
 * The attributes are read back as strings so one component can draw any kind's
 * without knowing which; the closed shapes they were written under live in
 * contracts.semantic.ts and are checked where they are written.
 */
export async function read(db: Queryable, entityId: string): Promise<StoredProfile | null> {
  const { rows } = await db.query<{
    profile_md: string | null;
    profile_version: number;
    profile_updated_at: Date | null;
    stale: boolean;
    attributes: Record<string, string | null>;
    attributes_source: Record<string, unknown>;
  }>(
    `select profile_md, profile_version, profile_updated_at, stale, attributes, attributes_source
       from core.entities where id = $1::bigint and merged_into is null`,
    [entityId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    markdown: row.profile_md,
    version: row.profile_version,
    updatedAt: row.profile_updated_at?.toISOString() ?? null,
    stale: row.stale,
    attributes: row.attributes,
    attributeSources: z.record(z.string(), AttributeSource).catch({}).parse(row.attributes_source),
  };
}

/**
 * The things whose profile should be rewritten next: never profiled first,
 * then oldest, skipping anything written within the floor.
 *
 * The floor is what keeps the cost following the day's new mail rather than
 * the size of the table. A thing nobody wrote about today is not rewritten
 * today, however stale a resolution pass marked it.
 */
export async function staleIds(db: Queryable, limit: number, floorHours: number): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `select id::text as id from core.entities
      where stale and merged_into is null
        and (profile_updated_at is null or profile_updated_at < now() - make_interval(hours => $2::int))
      order by profile_updated_at nulls first
      limit $1::int`,
    [limit, floorHours],
  );
  return rows.map((row) => row.id);
}

export interface ProfileWrite {
  markdown: string;
  searchText: string;
  attributes: Record<string, string | null>;
  attributeSources: Record<string, AttributeSource>;
}

/**
 * One profile, with its version raised by one and `stale` cleared.
 *
 * The version is what a concept verdict stores, so raising it here is what
 * makes every verdict about this thing worth taking again, and nothing else's.
 */
export async function write(tx: Queryable, entityId: string, profile: ProfileWrite): Promise<number> {
  // The located keys are the locate step's and not the profile's. A profile
  // rewrite would otherwise put null over a coordinate that cost a search.
  const { rows } = await tx.query<{ profile_version: number }>(
    `update core.entities
        set profile_md = $2::text, search_text = $3::text,
            attributes = $4::jsonb
              || jsonb_strip_nulls(jsonb_build_object('lat', attributes->'lat', 'lon', attributes->'lon')),
            attributes_source = $5::jsonb
              || jsonb_strip_nulls(jsonb_build_object('lat', attributes_source->'lat', 'lon', attributes_source->'lon')),
            profile_version = profile_version + 1, profile_updated_at = now(), stale = false
      where id = $1::bigint
      returning profile_version`,
    [entityId, profile.markdown, profile.searchText, JSON.stringify(profile.attributes), JSON.stringify(profile.attributeSources)],
  );
  return rows[0]?.profile_version ?? 0;
}

/** Adds or replaces a few attributes and their sources, leaving the rest as they are. Does not touch the version. */
export async function mergeAttributes(
  tx: Queryable,
  entityId: string,
  attributes: Record<string, string | null>,
  sources: Record<string, AttributeSource>,
): Promise<void> {
  await tx.query(
    `update core.entities
        set attributes = attributes || $2::jsonb, attributes_source = attributes_source || $3::jsonb
      where id = $1::bigint`,
    [entityId, JSON.stringify(attributes), JSON.stringify(sources)],
  );
}
