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
