import type { Queryable } from "../../db";
import { emailRuns } from "../../ontology/repositories";
import { type ClassifyJob, type CompareJob, JOB_NAMES, type JobAdder, jobOptions } from "../names";

export interface ClassifyDeps {
  pool: Queryable;
  compare: JobAdder<CompareJob>;
}

/**
 * Phase 1: the email passes straight through. Phase 2 puts the rules between
 * the two stage writes and sends only BL_COMPARISON on to compare.
 */
export async function processClassify(deps: ClassifyDeps, data: ClassifyJob, priority: number): Promise<void> {
  const { runId, emailId } = data;
  await emailRuns.setStage(deps.pool, runId, emailId, "classifying");
  await emailRuns.setStage(deps.pool, runId, emailId, "classified");
  await deps.compare.add(JOB_NAMES.compare, { runId, emailId }, jobOptions(runId, emailId, priority));
}
