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
 * file looks at the sender, the subject or the body.
 *
 * A job can run twice: a retry, or a stalled job reclaimed while its first
 * copy is still finishing. So the model is asked once per email, and every
 * stage move names the stages it may start from, which keeps a second pass
 * from dragging an email that compare has already finished back to `classified`.
 *
 * A cancelled run's email stays where it stopped. The check runs again after
 * the model answers, because that call is where a job spends its time.
 */
export async function processClassify(deps: ClassifyDeps, data: ClassifyJob, priority: number): Promise<void> {
  const { runId, emailId } = data;
  if ((await runs.status(deps.pool, runId)) === "cancelled") return;

  const emailRunId = await emailRuns.idOf(deps.pool, runId, emailId);
  const email = await emails.get(deps.pool, emailId);
  if (!emailRunId || !email) throw new TerminalError(`email ${emailId} is not in run ${runId}`);

  let category = (await classifications.get(deps.pool, emailRunId))?.finalCategory;
  if (!category) {
    await emailRuns.moveStage(deps.pool, runId, emailId, ["ingested", "classifying"], "classifying");
    const files = await attachments.listForEmail(deps.pool, runId, emailId);
    const input = buildClassifyInput(
      email,
      files.map((file) => file.filename),
      config.CLASSIFY_BODY_CHARS,
    );
    const { value, model, promptVersion } = await classifyEmail(deps, input, { runId, emailRunId });
    if ((await runs.status(deps.pool, runId)) === "cancelled") return;

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
    category = value.category;
  }
  await emailRuns.moveStage(deps.pool, runId, emailId, ["ingested", "classifying"], "classified");

  if (category !== "BL_COMPARISON") {
    await emailRuns.moveStage(deps.pool, runId, emailId, ["classified"], "done", {
      outcome: "not_comparable",
      finished: true,
    });
    return;
  }
  await deps.compare.add(JOB_NAMES.compare, { runId, emailId }, jobOptions(runId, emailId, priority));
}
