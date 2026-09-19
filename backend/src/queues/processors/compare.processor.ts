import type { Queryable } from "../../db";
import { TerminalError } from "../../lib/errors";
import { comparisons, emailRuns, runs } from "../../ontology/repositories";
import type { CompareJob } from "../names";

export interface CompareDeps {
  pool: Queryable;
}

/**
 * A placeholder until phases 5 and 6 read the documents: every comparison
 * request finishes OK, and the row says it was not really compared. A
 * cancelled run's email stays where it stopped.
 */
export async function processCompare(deps: CompareDeps, data: CompareJob): Promise<void> {
  const { runId, emailId } = data;
  if ((await runs.status(deps.pool, runId)) === "cancelled") return;

  const emailRunId = await emailRuns.idOf(deps.pool, runId, emailId);
  if (!emailRunId) throw new TerminalError(`email ${emailId} is not in run ${runId}`);

  // From `classified` or `comparing` only: a second pass over a finished email changes nothing.
  if (!(await emailRuns.moveStage(deps.pool, runId, emailId, ["classified", "comparing"], "comparing"))) return;
  await comparisons.upsert(deps.pool, { emailRunId, status: "OK", reviewReason: null, detail: { placeholder: true } });
  await emailRuns.moveStage(deps.pool, runId, emailId, ["comparing"], "done", { outcome: "OK", finished: true });
}
