import type { Queryable } from "../../db";
import { emailRuns, runs } from "../../ontology/repositories";
import { type ClassifyJob, type CompareJob, JOB_NAMES, type JobAdder, jobOptions } from "../names";

export interface ClassifyDeps {
  pool: Queryable;
  compare: JobAdder<CompareJob>;
}

/**
 * Phase 1: the email passes straight through. Phase 2 puts the rules between
 * the two stage writes and sends only BL_COMPARISON on to compare. A cancelled
 * run's email stays where it stopped: cancel cannot remove a job that is
 * already active or that the ingest loop adds a moment later.
 */
export async function processClassify(deps: ClassifyDeps, data: ClassifyJob, priority: number): Promise<void> {
  const { runId, emailId } = data;
  if ((await runs.status(deps.pool, runId)) === "cancelled") return;
  await emailRuns.setStage(deps.pool, runId, emailId, "classifying");
  await emailRuns.setStage(deps.pool, runId, emailId, "classified");
  await deps.compare.add(JOB_NAMES.compare, { runId, emailId }, jobOptions(runId, emailId, priority));
}
