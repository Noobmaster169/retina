import type { Pool } from "pg";

import { withTx } from "../db";
import { childLogger } from "../lib/logger";
import { reconcile, resolveEntities } from "../pipeline/ontology";
import { analytics, entities, entityInputs, entityResolution } from "./repositories";

const log = childLogger({ module: "derived" });

/**
 * Everything that is computed from `core` rather than written to it: the
 * `analytics` views, and the things the resolver clusters out of what models
 * read.
 *
 * One module because they are one responsibility. Both are rebuildable from
 * `core` alone, both go stale for exactly the same reason, and a caller that
 * had to remember to run two of these in the right order would eventually run
 * one of them.
 */

export interface RefreshResult {
  views: boolean;
  entities: number | null;
}

/**
 * Rebuilds the clusters and plans them onto the ids that already hold them.
 *
 * Two model steps may join spellings and both arrive as verdicts: the field
 * judge's, on two values it compared side by side, and `entity-resolve`'s, on
 * a spelling the field judge never saw. Reading the second back from the names
 * it wrote is what stops the two disagreeing about which cluster a spelling is
 * in.
 */
export async function resolveAll(db: Pool): Promise<number> {
  const [mentions, verdicts, joins, sightings, existing] = await Promise.all([
    entityInputs.loadMentions(db),
    entityInputs.loadVerdicts(db),
    entityInputs.loadResolveJoins(db),
    entityInputs.loadSightings(db),
    entityInputs.loadExisting(db),
  ]);
  const resolved = resolveEntities(mentions, [...verdicts, ...joins], sightings);
  const plan = reconcile(resolved, existing);
  // One transaction, because the merges, the drops and the writes are one
  // replacement: a reader between them would see an ontology half rebuilt.
  await withTx(db, (tx) => entityResolution.applyResolution(tx, plan));
  log.info(
    { things: resolved.length, kept: plan.keep.length, inserted: plan.insert.length, merged: plan.merge.length, dropped: plan.drop.length },
    "resolved the ontology from what the judges accepted",
  );
  return resolved.length;
}

/**
 * Brings everything derived level with `core`, each on its own check.
 *
 * Two checks and not one, which cost a deployment to learn: a materialized
 * view is created already populated, so on a fresh database the views are
 * level with core while the resolved tables are empty. Gating the resolver on
 * the views' watermark meant it would never run until something else moved,
 * and the ontology pages opened empty with nothing wrong anywhere.
 */
export async function refreshIfStale(db: Pool): Promise<RefreshResult> {
  const [viewsStale, entitiesStale] = await Promise.all([analytics.isStale(db), entities.isStale(db)]);
  if (viewsStale) await analytics.refresh(db);
  return { views: viewsStale, entities: entitiesStale ? await resolveAll(db) : null };
}
