import type { Pool } from "pg";

import type { LlmClient } from "../agents";
import { childLogger } from "../lib/logger";
import { continueConcept } from "../ontology/concept-search";
import { concepts } from "../ontology/repositories";

const log = childLogger({ module: "backfill-concepts" });

/**
 * Finishes a concept a question could not finish in its own turn.
 *
 * Only a concept somebody asked twice, or asked a total over, is here: a
 * one-off phrase costs one budget and stops. That is the whole reason
 * `backfill_wanted` is a column rather than "anything with deferred things".
 */

export interface BackfillDeps {
  pool: Pool;
  llm: LlmClient;
}

/**
 * One concept per tick and one budget of it. A concept over 200,000 things is
 * 5,000 model calls; doing them in one pass would hold an ontology slot for as
 * long as it took and starve every email's reading behind it.
 */
export async function backfillConcepts(deps: BackfillDeps): Promise<number> {
  const [concept] = await concepts.wantingBackfill(deps.pool, 1);
  if (!concept) return 0;

  const answer = await continueConcept(deps, concept);

  if (answer.reading.complete) await concepts.doneBackfilling(deps.pool, concept.id);
  log.info(
    { conceptId: concept.id, phrase: concept.phrase, judged: answer.reading.judged, left: answer.reading.deferred },
    answer.reading.complete ? "a concept is complete" : "a concept is closer to complete",
  );
  return answer.reading.judged;
}

/** How long a tick waits before taking another budget. Kept beside the job it paces. */
export const BACKFILL_EVERY_MS = 5 * 60 * 1000;
