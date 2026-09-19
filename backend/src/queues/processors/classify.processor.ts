import { classifyEmail, type LlmClient } from "../../agents";
import { config } from "../../config";
import type { Queryable } from "../../db";
import { TerminalError } from "../../lib/errors";
import { attachments, classifications, emailRuns, emails, runs } from "../../ontology/repositories";
import { buildClassifyInput } from "../../pipeline/classify";
import { type ClassifyJob, type CompareJob, JOB_NAMES, type JobAdder, jobOptions } from "../names";

export interface ClassifyDeps {
  pool: Queryable;
  llm: LlmClient;
  compare: JobAdder<CompareJob>;
}

/**
 * The model names the category; only a comparison request goes on to the
 * compare queue. There is no rule here and none may be added: nothing in this
 * file looks at the sender, the subject or the body. A cancelled run's email
 * stays where it stopped: cancel cannot remove a job that is already active or
 * that the ingest loop adds a moment later.
 */
export async function processClassify(deps: ClassifyDeps, data: ClassifyJob, priority: number): Promise<void> {
  const { runId, emailId } = data;
  if ((await runs.status(deps.pool, runId)) === "cancelled") return;

  const emailRunId = await emailRuns.idOf(deps.pool, runId, emailId);
  const email = await emails.get(deps.pool, emailId);
  if (!emailRunId || !email) throw new TerminalError(`email ${emailId} is not in run ${runId}`);

  await emailRuns.setStage(deps.pool, runId, emailId, "classifying");
  const files = await attachments.listForEmail(deps.pool, runId, emailId);
  const input = buildClassifyInput(
    email,
    files.map((file) => file.filename),
    config.CLASSIFY_BODY_CHARS,
  );
  const { value, model, promptVersion } = await classifyEmail(deps, input, { runId, emailRunId });

  await classifications.upsert(deps.pool, {
    emailRunId,
    genCategory: value.category,
    genConfidence: value.confidence,
    finalCategory: value.category,
    decidedBy: "llm",
    rationale: { generator: value.rationale },
    model,
    promptVersion,
  });
  await emailRuns.setStage(deps.pool, runId, emailId, "classified");

  if (value.category !== "BL_COMPARISON") {
    await emailRuns.setStage(deps.pool, runId, emailId, "done", { outcome: "not_comparable", finished: true });
    return;
  }
  await deps.compare.add(JOB_NAMES.compare, { runId, emailId }, jobOptions(runId, emailId, priority));
}
