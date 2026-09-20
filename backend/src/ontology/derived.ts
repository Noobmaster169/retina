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
 * Brings everything derived level with `core`, when `core` has moved.
 *
 * Staleness is the analytics watermark, which also covers the resolver: a new
 * mention arrives with the email run that produced it, and a new verdict with
 * the comparison, so nothing can change the resolver's input without moving
 * that mark.
 */
export async function refreshIfStale(db: Pool): Promise<RefreshResult> {
  if (!(await analytics.isStale(db))) return { views: false, entities: null };
  await analytics.refresh(db);
  return { views: true, entities: await resolveAll(db) };
}
