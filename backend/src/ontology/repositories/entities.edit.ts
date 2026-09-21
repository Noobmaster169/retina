import type { AttributeSource, EntityKind } from "../../contracts";
import type { Queryable } from "../../db";
import { mergeAttributes } from "./entities.profile";
import { applyMerge } from "./entities.resolution";

/**
 * What a person may change about a resolved thing from the interface:
 * its attributes, its name, and which other thing it is the same as.
 *
 * Every write records who made it. An attribute a person set carries source
 * `human`, which the profile job never overwrites and the reference list
 * never replaces. A merge is recorded as a person's join of every spelling,
 * so the next resolution pass reads it back as a verdict and keeps the two
 * together; a rename is kept as `human_name`, which the pass prefers.
 */

export class EditRefused extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
    this.name = "EditRefused";
  }
}

interface Live {
  id: string;
  kind: EntityKind;
  canonical: string;
}

async function live(db: Queryable, id: string, kind: EntityKind): Promise<Live> {
  const { rows } = await db.query<Live>("select id::text as id, kind, canonical from core.entities where id = $1::bigint and merged_into is null", [id]);
  const row = rows[0];
  if (!row || row.kind !== kind) throw new EditRefused("no such thing", 404);
  return row;
}

async function touched(tx: Queryable, id: string, actor: string): Promise<void> {
  await tx.query("update core.entities set edited_by = $2::text, edited_at = now(), stale = true where id = $1::bigint", [id, actor]);
}

export async function setAttributes(
  tx: Queryable,
  kind: EntityKind,
  id: string,
  attributes: Record<string, string | null>,
  actor: string,
): Promise<void> {
  await live(tx, id, kind);
  const source: AttributeSource = { source: "human", confidence: null, llmCallId: null };
  await mergeAttributes(tx, id, attributes, Object.fromEntries(Object.keys(attributes).map((key) => [key, source])));
  await touched(tx, id, actor);
}

/** The name a person chose. Unique among the live things of its kind, like every canonical. */
export async function rename(tx: Queryable, kind: EntityKind, id: string, name: string, actor: string): Promise<void> {
  await live(tx, id, kind);
  const { rows } = await tx.query<{ id: string }>(
    "select id::text as id from core.entities where kind = $1::text and canonical = $2::text and merged_into is null and id <> $3::bigint",
    [kind, name, id],
  );
  if (rows[0]) throw new EditRefused(`another ${kind} is already called ${name}`, 409);
  await tx.query("update core.entities set canonical = $2::text, human_name = $2::text where id = $1::bigint", [id, name]);
  await tx.query(
    `insert into core.entity_names (entity_id, value, seen_count, joined_by) values ($1::bigint, $2::text, 0, 'human')
     on conflict (entity_id, value) do nothing`,
    [id, name],
  );
  await touched(tx, id, actor);
}

/**
 * One thing is the same as another. The loser's every spelling joins the
 * survivor as a person's join, with `joined_step` set so the resolver reads
 * each back as a verdict; then the loser is tombstoned as a model's merge is.
 */
export async function mergeInto(tx: Queryable, kind: EntityKind, from: string, into: string, actor: string): Promise<void> {
  if (from === into) throw new EditRefused("a thing cannot be the same as itself", 409);
  await live(tx, from, kind);
  await live(tx, into, kind);
  await tx.query(
    `insert into core.entity_names (entity_id, value, seen_count, joined_by, confidence, joined_step)
     select $2::bigint, n.value, n.seen_count, 'human', 1, 'human'
       from core.entity_names n where n.entity_id = $1::bigint
     on conflict (entity_id, value) do update set joined_by = 'human', confidence = 1, joined_step = 'human'`,
    [from, into],
  );
  await tx.query("update core.entity_mentions set entity_id = $2::bigint where entity_id = $1::bigint", [from, into]);
  // The person chose which of the two to keep, and that choice covers its
  // name: without this the next pass could hand the survivor the loser's spelling.
  await tx.query("update core.entities set human_name = coalesce(human_name, canonical) where id = $1::bigint", [into]);
  await applyMerge(tx, Number(from), Number(into));
  await touched(tx, into, actor);
}
