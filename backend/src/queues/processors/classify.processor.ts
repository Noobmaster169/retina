import { ClassifyOutput, classifyEmail, type LlmClient, promptFor, verifyClassification } from "../../agents";
import { config } from "../../config";
import type { Category, PromptSet } from "../../contracts";
import type { Queryable } from "../../db";
import type { DocExtractClient } from "../../doc-extract";
import { TerminalError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import type { LiveCalls } from "../../live";
import { attachments, classifications, emailRuns, emails, llmCalls, type Run, runs, type StoredAttachment } from "../../ontology/repositories";
import { buildClassifyInput, type ClassifyInput, decide, describeAttachments, needsVerifier } from "../../pipeline/classify";
import type { ObjectStore } from "../../storage";
import { type ClassifyJob, type CompareJob, JOB_NAMES, type JobAdder, jobOptions } from "../names";
import { parseDocuments } from "./parse-documents";
import { promptSetOf } from "./prompt-set-of";

const log = childLogger({ module: "classify.processor" });

export interface ClassifyDeps {
  pool: Queryable;
  llm: LlmClient;
  docExtract: DocExtractClient;
  store: ObjectStore;
  compare: JobAdder<CompareJob>;
  /** Where each call's answer so far is kept while it streams, for the run page. */
  live?: LiveCalls;
}

interface Ids {
  runId: string;
  emailId: string;
  emailRunId: string;
}

/**
 * The attachments' text, for a prompt that reads it: the files are parsed
 * here and compare finds the rows. A prompt that does not read attachments
 * leaves parsing to compare, so its input is exactly what it was before.
 */
async function attachmentContents(deps: ClassifyDeps, set: PromptSet, files: StoredAttachment[], ids: Ids): Promise<string | undefined> {
  const reads = promptFor("classify", set).readsAttachments || promptFor("classify-verify", set).readsAttachments;
  if (!reads) return undefined;
  const docs = await parseDocuments(deps, ids, files);
  return describeAttachments(docs, config.CLASSIFY_ATTACHMENT_CHARS);
}

/**
 * The generator's answer. When an earlier attempt of this job already got one
 * under the same prompt and then failed later (a verifier outage), that answer
 * is reused rather than paid for again.
 */
async function generate(deps: ClassifyDeps, set: PromptSet, input: ClassifyInput, ids: Ids): Promise<ClassifyOutput> {
  const prompt = promptFor("classify", set);
  const earlier = ClassifyOutput.safeParse(await llmCalls.latestAccepted(deps.pool, ids.emailRunId, "classify", prompt.version));
  if (earlier.success) return earlier.data;
  return (await classifyEmail(deps, prompt, input, ids)).value;
}

/**
 * The verifier's answer, or null. A verifier that fails for good (an answer
 * that never fits its schema) must not throw away a valid generator answer:
 * the email keeps the generator's category and the failure is recorded. A
 * transient failure still propagates, and the retry reuses the generator.
 */
async function verify(deps: ClassifyDeps, set: PromptSet, input: ClassifyInput, gen: ClassifyOutput, ids: Ids) {
  try {
    return { value: (await verifyClassification(deps, promptFor("classify-verify", set), input, gen, ids)).value, error: null };
  } catch (error) {
    if (!(error instanceof TerminalError)) throw error;
    log.warn({ ...ids, stage: "classify", err: error.message }, "verifier failed, keeping the generator's category");
    return { value: null, error: error.message };
  }
}

/** Generator, the verifier when the generator is unsure, then the decision. Null when the run was cancelled meanwhile. */
async function classifyOnce(deps: ClassifyDeps, run: Run, ids: Ids): Promise<Category | null> {
  const email = await emails.get(deps.pool, ids.emailId);
  if (!email) throw new TerminalError(`email ${ids.emailId} is not stored`);
  const files = await attachments.listForEmail(deps.pool, run.id, ids.emailId);
  const set = await promptSetOf(deps.pool, run);
  const input: ClassifyInput = {
    ...buildClassifyInput(
      email,
      files.map((file) => file.filename),
      config.CLASSIFY_BODY_CHARS,
    ),
    attachmentContents: await attachmentContents(deps, set, files, ids),
  };
  const classify = promptFor("classify", set);

  const gen = await generate(deps, set, input, ids);
  const ver = needsVerifier(gen) ? await verify(deps, set, input, gen, ids) : null;
  if ((await runs.status(deps.pool, run.id)) === "cancelled") return null;

  const { finalCategory, decidedBy } = decide(gen, ver?.value ?? null);
  await classifications.upsert(deps.pool, {
    emailRunId: ids.emailRunId,
    genCategory: gen.category,
    genConfidence: gen.confidence,
    verCategory: ver?.value?.category ?? null,
    verConfidence: ver?.value?.confidence ?? null,
    finalCategory,
    decidedBy,
    rationale: {
      generator: gen.rationale,
      ...(ver?.value ? { verifier: ver.value.rationale, counterCases: ver.value.counter_cases } : {}),
      ...(ver?.error ? { verifierError: ver.error } : {}),
    },
    model: classify.model,
    promptVersion: classify.version,
  });
  log.info(
    {
      runId: run.id,
      emailId: ids.emailId,
      stage: "classify",
      category: finalCategory,
      confidence: gen.confidence,
      decidedBy,
      overruled: ver?.value ? ver.value.category !== gen.category : false,
    },
    "classified",
  );
  return finalCategory;
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
  const run = await runs.get(deps.pool, runId);
  if (!run) throw new TerminalError(`run ${runId} does not exist`);
  if (run.status === "cancelled") return;

  const emailRunId = await emailRuns.idOf(deps.pool, runId, emailId);
  if (!emailRunId) throw new TerminalError(`email ${emailId} is not in run ${runId}`);

  let category = (await classifications.get(deps.pool, emailRunId))?.finalCategory ?? null;
  if (!category) {
    await emailRuns.moveStage(deps.pool, runId, emailId, ["ingested", "classifying"], "classifying");
    category = await classifyOnce(deps, run, { runId, emailId, emailRunId });
    if (!category) return;
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
