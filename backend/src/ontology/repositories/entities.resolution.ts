import type { Queryable } from "../../db";
import type { ReconcilePlan, ResolvedEntity } from "../../pipeline/ontology";

/**
 * Writes a resolution pass without changing an id that still means the same
 * thing.
 *
 * This replaced `replaceAll`, which deleted every row and reinserted. That was
 * correct while an id meant nothing and became wrong the moment a profile, a
 * concept verdict and a shipment column started hanging on one. What is still
 * replaced wholesale is every spelling and every document mention, because the
 * resolver derives both in full on every pass.
 *
 * One transaction, because the merges, the drops and the writes are one
 * replacement: a reader between them would see an ontology half rebuilt.
 */

async function writeNames(tx: Queryable, id: string, entity: ResolvedEntity): Promise<void> {
  await tx.query("delete from core.entity_names where entity_id = $1::bigint", [id]);
  for (const name of entity.names) {
    await tx.query(
      `insert into core.entity_names (entity_id, value, seen_count, joined_by, confidence, joined_step)
       values ($1::bigint, $2::text, $3::int, $4::text, $5::numeric, $6::text)`,
      [id, name.value, name.seenCount, name.joinedBy, name.confidence, name.joinedStep],
    );
  }
  for (const mention of entity.mentions) {
    await tx.query(
      `insert into core.entity_mentions (entity_id, extraction_field_id, email_run_id, field, value)
       values ($1::bigint, $2::bigint, $3::bigint, $4::text, $5::text)`,
      [id, mention.extractionFieldId, mention.emailRunId, mention.field, mention.value],
    );
  }
}

/**
 * Everything that hangs on the loser of a merge follows the survivor, and the
 * loser is left as a pointer: no spellings, no mentions, just the row and
 * where it went.
 *
 * The concept verdicts do not follow: they were judged against a profile that
 * no longer describes anything, and carrying one over would be an answer to a
 * question nobody asked about this thing. The survivor is marked stale, so its
 * profile is rewritten and the next question judges it once.
 */
async function applyMerge(tx: Queryable, from: number, into: number): Promise<void> {
  await tx.query("update core.entity_sightings set entity_id = $2::bigint where entity_id = $1::bigint", [from, into]);
  for (const column of ["shipper_id", "consignee_id", "notify_party_id", "pol_id", "pod_id", "carrier_id", "vessel_id", "commodity_id"]) {
    await tx.query(`update core.email_shipments set ${column} = $2::bigint where ${column} = $1::bigint`, [from, into]);
  }
  await tx.query("delete from core.concept_verdicts where entity_id = $1::bigint", [from]);
  await tx.query("delete from core.entity_names where entity_id = $1::bigint", [from]);
  await tx.query("update core.entities set merged_into = $2::bigint, stale = true where id = $1::bigint", [from, into]);
}

/**
 * Moves the canonical of every kept thing whose spelling is about to change
 * out of the way, in one statement.
 *
 * `(kind, canonical)` is unique among the things that still denote something,
 * and a pass that hands one thing the spelling another is about to give up
 * would break it halfway through the loop and abort the whole refresh. Nothing
 * real is spelt with a control character, so the parking spot cannot collide
 * with a spelling or with another parking spot.
 */
async function park(tx: Queryable, keep: ReconcilePlan["keep"]): Promise<void> {
  if (keep.length === 0) return;
  await tx.query(
    `update core.entities e
        set canonical = chr(1) || e.id::text
       from unnest($1::bigint[], $2::text[]) as want(id, canonical)
      where e.id = want.id and e.canonical is distinct from want.canonical`,
    [keep.map((kept) => String(kept.id)), keep.map((kept) => kept.cluster.canonical)],
  );
}

export async function applyResolution(tx: Queryable, plan: ReconcilePlan): Promise<number> {
  // A refresh renames, merges and deletes things a reading may be deciding
  // about, so it takes turns with every reading's write.
  await lockWrites(tx);
  for (const merge of plan.merge) await applyMerge(tx, merge.from, merge.into);
  if (plan.drop.length > 0) {
    // Cascades to its names, mentions, sightings and verdicts. reconcile only
    // drops a thing nothing read any more, so there is nothing left to lose.
    await tx.query("delete from core.entities where id = any($1::bigint[])", [plan.drop.map(String)]);
  }

  // Every mention at once, before any is written back. `extraction_field_id`
  // is unique across the table, so a value that moved from one thing to
  // another would collide with itself if the two were rewritten one at a time.
  await tx.query("delete from core.entity_mentions");
  await park(tx, plan.keep);

  for (const { id, cluster } of plan.keep) {
    await tx.query(
      `update core.entities
          set canonical = $2::text, mention_count = $3::int, name_count = $4::int, sighting_count = $5::int,
              first_seen_at = $6::timestamptz, last_seen_at = $7::timestamptz, resolved_at = now(),
              stale = stale or mention_count is distinct from $3::int or sighting_count is distinct from $5::int
        where id = $1::bigint`,
      [id, cluster.canonical, cluster.mentions.length, cluster.names.length, cluster.sightingCount, cluster.firstSeenAt, cluster.lastSeenAt],
    );
    await writeNames(tx, String(id), cluster);
  }

  for (const cluster of plan.insert) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into core.entities (kind, canonical, mention_count, name_count, sighting_count, first_seen_at, last_seen_at)
       values ($1::text, $2::text, $3::int, $4::int, $5::int, $6::timestamptz, $7::timestamptz)
       returning id::text as id`,
      [cluster.kind, cluster.canonical, cluster.mentions.length, cluster.names.length, cluster.sightingCount, cluster.firstSeenAt, cluster.lastSeenAt],
    );
    await writeNames(tx, rows[0].id, cluster);
  }

  return plan.keep.length + plan.insert.length;
}

/** An arbitrary constant, one per purpose: the number every ontology write takes the advisory lock under. */
const ONTOLOGY_WRITE_LOCK = 7_204_112_001;

/**
 * Held to the end of the transaction. Every reading's write takes it, so two
 * readings cannot each decide against a list of near things the other is about
 * to change. It orders writers and nothing else: readers, and the model calls
 * that come before a write, never wait on it.
 */
export async function lockWrites(tx: Queryable): Promise<void> {
  await tx.query("select pg_advisory_xact_lock($1::bigint)", [ONTOLOGY_WRITE_LOCK]);
}

/**
 * A thing nothing in the database denoted yet, from one sighting.
 *
 * Stale from the moment it exists, so the profile job writes it something to
 * be; its first spelling joined `kept`, because nothing judged it against
 * anything. The next full resolution pass rebuilds it from the sighting and
 * keeps this id.
 */
export async function insertFromSighting(tx: Queryable, kind: string, surface: string, seenAt: Date): Promise<number> {
  const { rows } = await tx.query<{ id: string }>(
    `insert into core.entities (kind, canonical, mention_count, name_count, sighting_count, first_seen_at, last_seen_at)
     values ($1::text, $2::text, 0, 1, 1, $3::timestamptz, $3::timestamptz)
     on conflict (kind, canonical) where merged_into is null do update set sighting_count = core.entities.sighting_count + 1, stale = true
     returning id::text as id`,
    [kind, surface, seenAt],
  );
  const id = Number(rows[0].id);
  await tx.query(
    `insert into core.entity_names (entity_id, value, seen_count, joined_by)
     values ($1::bigint, $2::text, 1, 'kept') on conflict (entity_id, value) do nothing`,
    [id, surface],
  );
  return id;
}

/**
 * A spelling the `entity-resolve` step said denotes a thing we already hold.
 *
 * `joined_step` is what the next resolution pass reads back as a verdict, so
 * the two judges cannot disagree about which cluster a spelling is in.
 */
export async function addJudgedName(tx: Queryable, entityId: number, value: string, confidence: number): Promise<void> {
  await tx.query(
    `insert into core.entity_names (entity_id, value, seen_count, joined_by, confidence, joined_step)
     values ($1::bigint, $2::text, 1, 'judge', $3::numeric, 'entity-resolve')
     on conflict (entity_id, value) do update set joined_step = coalesce(core.entity_names.joined_step, 'entity-resolve')`,
    [entityId, value, confidence],
  );
  await tx.query("update core.entities set sighting_count = sighting_count + 1, stale = true where id = $1::bigint", [entityId]);
}
