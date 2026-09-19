import type { Queryable } from "../../db";
import { emailRuns, runs } from "../../ontology/repositories";
import type { CompareJob } from "../names";

export interface CompareDeps {
  pool: Queryable;
}

/** Phase 1: nothing is compared yet, so every email finishes OK. A cancelled run's email stays where it stopped. */
export async function processCompare(deps: CompareDeps, data: CompareJob): Promise<void> {
  const { runId, emailId } = data;
  if ((await runs.status(deps.pool, runId)) === "cancelled") return;
  await emailRuns.setStage(deps.pool, runId, emailId, "comparing");
  await emailRuns.setStage(deps.pool, runId, emailId, "done", { outcome: "OK", finished: true });
}
