import type { Pool } from "pg";

import { withTx } from "../db";
import { childLogger } from "../lib/logger";
import { resolveEntities } from "../pipeline/ontology";
import { analytics, entities } from "./repositories";

const log = childLogger({ module: "derived" });

/**
 * Everything that is computed from `core` rather than written to it: the
 * `analytics` views, and the ports and parties the resolver clusters out of
 * what the extractor read.
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

/** Rebuilds the resolved things from scratch, in one transaction. */
export async function resolveAll(db: Pool): Promise<number> {
  const [mentions, verdicts] = await Promise.all([entities.loadMentions(db), entities.loadVerdicts(db)]);
  const resolved = resolveEntities(mentions, verdicts);
  // One transaction, because the delete and the inserts are one replacement:
  // a reader between them would see an ontology with nothing in it.
  await withTx(db, (tx) => entities.replaceAll(tx, resolved));
  log.info(
    { things: resolved.length, mentions: mentions.length, verdicts: verdicts.length },
    "resolved the ontology from what the judge accepted",
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
