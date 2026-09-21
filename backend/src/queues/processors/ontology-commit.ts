import type { Queryable, Transactor } from "../../db";
import { RetryableError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import { mutex } from "../../lib/parallel";
import { entityInputs, entityResolution, entitySearch } from "../../ontology/repositories";
import { type AssembledShipment, planSighting, seenAmong, standing } from "../../pipeline/ontology";
import type { OntologyJob } from "../names";
import type { EmailRunIds } from "./ids";
import { CANDIDATES, type Decision, type ResolveDeps } from "./ontology-decide";
import { type Kept, type ResolvedOntology, resolveSightings } from "./ontology-resolve";
import { writeOntology } from "./ontology-write";

const log = childLogger({ module: "ontology.commit" });

/**
 * Writes one email's reading so that the result is the one a serial run would
 * have produced.
 *
 * Readings may run at once, and each judges its spellings against what was
 * committed when it began. Two that both meet a company for the first time,
 * spelled two ways, would each make a new thing where the second one of a serial
 * pair would have been told the first exists. So the write does not trust the
 * judgement: under a lock it asks whether the list of near things any judgement
 * was shown is still the list there is, and where it is not it judges that
 * spelling again, outside the lock, against the new state.
 *
 * The model never runs under the lock and a reading that moved nothing pays
 * nothing but two reads per judged spelling. A family of names many readings
 * are racing over costs each of them another round, one at a time, which is the
 * serial cost and no worse.
 */

/** Rounds of judging again before the reading is handed back to the queue. Each takes another reading committing something near one of its spellings. */
const MAX_ROUNDS = 12;

/**
 * One write transaction at a time in this process. The database lock holds
 * across processes; this keeps a queue of writers from each holding a pooled
 * connection while they wait for it.
 */
const oneWrite = mutex();

export interface CommitDeps extends ResolveDeps {
  tx: Transactor;
}

export interface Committed {
  touched: number[];
  rounds: number;
  /** Spellings judged a second time because the list they were judged against had changed. */
  redecided: number;
}

interface Moved {
  /** Spellings now held exactly by a thing another reading created: use it, no judgement needed. */
  adopt: Map<string, Decision>;
  again: string[];
}

/** Every judgement in `resolved` that could differ if it were made now. */
async function whatMoved(db: Queryable, resolved: ResolvedOntology): Promise<Moved> {
  const moved: Moved = { adopt: new Map(), again: [] };
  for (const [key, decision] of resolved.decisions) {
    if (decision.action === "use") continue;
    const plan = planSighting(decision.kind, decision.surface, await entityInputs.loadNameHits(db, [decision.surface]));
    const nearby = seenAmong(await entitySearch.findCandidates(db, decision.surface, decision.kind, CANDIDATES));
    const now = standing(decision.seen, { plan, nearby });
    if (now.holds) continue;
    if (now.use === null) moved.again.push(key);
    else moved.adopt.set(key, { action: "use", entityId: now.use });
  }
  return moved;
}

function withAdopted(resolved: ResolvedOntology, adopt: Map<string, Decision>): ResolvedOntology {
  const decisions = new Map(resolved.decisions);
  const ambiguous = new Map(resolved.ambiguous);
  for (const [key, decision] of adopt) {
    decisions.set(key, decision);
    ambiguous.set(key, false);
  }
  return { ...resolved, decisions, ambiguous, sightings: resolved.sightings.map((sighting) => (adopt.has(sighting.thing) ? { ...sighting, ambiguous: false } : sighting)) };
}

/** What still stands after `moved`, for the next round to decide around. */
function standingAfter(resolved: ResolvedOntology, moved: Moved): Kept {
  const adopted = withAdopted(resolved, moved.adopt);
  for (const key of moved.again) {
    adopted.decisions.delete(key);
    adopted.ambiguous.delete(key);
  }
  return adopted;
}

type Round = { written: number[] } | { moved: Moved };

export async function commitReading(deps: CommitDeps, job: OntologyJob, ids: EmailRunIds, assembled: AssembledShipment, first: ResolvedOntology): Promise<Committed> {
  let resolved = first;
  let redecided = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const attempt = await oneWrite<Round>(() =>
      deps.tx(async (tx): Promise<Round> => {
        await entityResolution.lockWrites(tx);
        const moved = await whatMoved(tx, resolved);
        if (moved.again.length > 0) return { moved };
        return { written: await writeOntology(tx, job, assembled, withAdopted(resolved, moved.adopt)) };
      }),
    );
    if ("written" in attempt) return { touched: attempt.written, rounds: round, redecided };

    redecided += attempt.moved.again.length;
    log.info({ ...ids, stage: "ontology", round, moved: attempt.moved.again.length }, "the ontology moved while this email was being read; judging those spellings again");
    resolved = await resolveSightings(deps, ids, assembled, standingAfter(resolved, attempt.moved));
  }
  throw new RetryableError(`the ontology kept moving under email ${job.emailId} for ${MAX_ROUNDS} rounds`);
}
