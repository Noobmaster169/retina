/**
 * Which things a concept question judges now, which it already knows, and
 * which it leaves for later.
 *
 * The whole cost model of the semantic layer is in this function. A verdict is
 * stored against the profile version it read, so a question asked twice is a
 * lookup and a profile rewritten since makes exactly the things it describes
 * worth judging again. Above the budget the answer says how many were left,
 * because an answer that looks complete when it is not is worse than a slow
 * one.
 *
 * Pure. No database, no clock, no io.
 */

export interface Candidate {
  entityId: number;
  /** The version its profile is at now. */
  profileVersion: number;
}

export interface HeldVerdict {
  entityId: number;
  /** The version the stored verdict was judged against. Lower than the candidate's means stale. */
  profileVersion: number;
}

export interface JudgingPlan {
  /** A verdict judged against the profile this thing still has. */
  reuse: number[];
  /** In rank order. Never more than the budget. */
  judgeNow: number[];
  /** Over the budget, in rank order, for a backfill to finish. */
  deferred: number[];
}

/**
 * `candidates` arrives in rank order, best first. Ranking is how the budget is
 * spent well; it never decides a verdict, and a thing the ranking put last is
 * judged exactly as a thing it put first would be.
 */
export function planJudging(candidates: Candidate[], held: HeldVerdict[], budget: number): JudgingPlan {
  const known = new Map(held.map((verdict) => [verdict.entityId, verdict.profileVersion]));
  const plan: JudgingPlan = { reuse: [], judgeNow: [], deferred: [] };

  for (const candidate of candidates) {
    const at = known.get(candidate.entityId);
    // Equal and not "at least": a version that ran ahead of the verdict means
    // the profile was rewritten, and one that ran behind cannot happen unless
    // something rolled back, in which case judging again is the safe answer.
    if (at !== undefined && at === candidate.profileVersion) {
      plan.reuse.push(candidate.entityId);
      continue;
    }
    if (plan.judgeNow.length < budget) plan.judgeNow.push(candidate.entityId);
    else plan.deferred.push(candidate.entityId);
  }
  return plan;
}

/** The batches one plan's judging goes out in. The schema of each call is built from exactly its ids. */
export function batches(ids: number[], size: number): number[][] {
  const out: number[][] = [];
  for (let at = 0; at < ids.length; at += size) out.push(ids.slice(at, at + size));
  return out;
}

/**
 * What the judge is shown about one thing.
 *
 * Here rather than beside the call, because a repository assembles it and an
 * adapter may not import another adapter's types. The two knowledge sources
 * stay apart all the way to the prompt: `observed` is what our mail shows and
 * `general` is the model's own, marked unverified wherever it is read.
 */
export interface JudgeSubject {
  id: number;
  name: string;
  attributes: Record<string, string | null>;
  summary: string;
  observed: string;
  general: string | null;
}
