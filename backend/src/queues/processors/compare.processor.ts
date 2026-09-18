import type { Queryable } from "../../db";
import { emailRuns } from "../../ontology/repositories";
import type { CompareJob } from "../names";

export interface CompareDeps {
  pool: Queryable;
}

/** Phase 1: nothing is compared yet, so every email finishes OK. */
export async function processCompare(deps: CompareDeps, data: CompareJob): Promise<void> {
  const { runId, emailId } = data;
  await emailRuns.setStage(deps.pool, runId, emailId, "comparing");
  await emailRuns.setStage(deps.pool, runId, emailId, "done", { outcome: "OK", finished: true });
}
