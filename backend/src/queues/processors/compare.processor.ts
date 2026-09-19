import { identifyDocument, type LlmClient, promptFor, TriageOutput, triageRequest } from "../../agents";
import { config } from "../../config";
import type { PromptSet } from "../../contracts";
import type { Queryable } from "../../db";
import type { DocExtractClient } from "../../doc-extract";
import { TerminalError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import type { LiveCalls } from "../../live";
import { attachments, comparisons, documents, emailRuns, emails, llmCalls, type Run, runs } from "../../ontology/repositories";
import { buildClassifyInput } from "../../pipeline/classify";
import { checkStructure, decisionDetail, type TriageRequest } from "../../pipeline/compare";
import { keys, type ObjectStore } from "../../storage";
import type { CompareJob } from "../names";
import { compareDocuments, provisionalResult, storeProvisional } from "./compare-pair";
import { escalate } from "./escalate";
import type { EmailRunIds } from "./ids";
import { type ParsedDocument, parseDocuments } from "./parse-documents";
import { promptSetOf } from "./prompt-set-of";

const log = childLogger({ module: "compare.processor" });

export interface CompareDeps {
  pool: Queryable;
  llm: LlmClient;
  docExtract: DocExtractClient;
  store: ObjectStore;
  /** Where each call's answer so far is kept while it streams, for the run page. */
  live?: LiveCalls;
}

const TEXT_CUT = "\n[the text was cut here for length]";

/** The model's word on what each readable document is. A document already typed is not asked about again. */
async function typeDocuments(deps: CompareDeps, set: PromptSet, docs: ParsedDocument[], ids: EmailRunIds): Promise<ParsedDocument[]> {
  const prompt = promptFor("doc-type", set);
  const typed: ParsedDocument[] = [];
  for (const doc of docs) {
    if (doc.text === null || doc.docType !== null) {
      typed.push(doc);
      continue;
    }
    const text = doc.text.length > config.DOC_TYPE_TEXT_CHARS ? doc.text.slice(0, config.DOC_TYPE_TEXT_CHARS) + TEXT_CUT : doc.text;
    const { value } = await identifyDocument(deps, prompt, { filename: doc.filename, role: doc.role, text }, ids);
    const verdict = { docType: value.doc_type, confidence: value.confidence, rationale: value.rationale };
    await documents.setDocType(deps.pool, doc.id, verdict);
    typed.push({ ...doc, docType: verdict.docType, docTypeConfidence: verdict.confidence, docTypeRationale: verdict.rationale });
  }
  return typed;
}

/** What an email with nothing attached asks for. An answer already paid for on an earlier attempt is reused. */
async function readRequest(deps: CompareDeps, set: PromptSet, ids: EmailRunIds): Promise<TriageRequest> {
  const prompt = promptFor("triage", set);
  const earlier = TriageOutput.safeParse(await llmCalls.latestAccepted(deps.pool, ids.emailRunId, "triage", prompt.version));
  if (earlier.success) return earlier.data.request;
  const email = await emails.get(deps.pool, ids.emailId);
  if (!email) throw new TerminalError(`email ${ids.emailId} is not stored`);
  const input = buildClassifyInput(email, [], config.CLASSIFY_BODY_CHARS);
  return (await triageRequest(deps, prompt, input, ids)).value.request;
}

/**
 * Page images for the reviewer, of the documents that are the reason they were
 * called: the ones that could not be read and the ones read by OCR. A readable
 * file beside them has its text and needs no picture, and a file that will not
 * open has no pages to draw.
 */
async function renderPages(deps: CompareDeps, docs: ParsedDocument[], ids: EmailRunIds): Promise<string[]> {
  const pages: string[] = [];
  for (const doc of docs.filter((d) => d.format === "pdf" && (d.unreadable || d.scanned))) {
    const rendered = await deps.docExtract.render({
      key: doc.objectKey,
      filename: doc.filename,
      outPrefix: keys.pages(ids.runId, ids.emailId, doc.filename),
    });
    pages.push(...rendered.pages.map((page) => page.key));
  }
  return pages;
}

/**
 * A structural escalation, with what the reviewer needs beside the reason: the
 * page images for anything unreadable, and for a scan the comparison run on
 * the OCR text as a suggested result. A scan is never silently trusted.
 */
async function escalateStructure(
  deps: CompareDeps,
  set: PromptSet,
  ids: EmailRunIds,
  docs: ParsedDocument[],
  outcome: { reason: Parameters<typeof escalate>[2]; detail: Record<string, unknown> },
): Promise<void> {
  const pages = outcome.reason === "unreadable" ? await renderPages(deps, docs, ids) : [];
  const scanned = outcome.reason === "unreadable" && outcome.detail.scanned === true;
  const provisional = scanned ? await provisionalResult(deps, set, ids, docs) : null;
  const detail = { ...outcome.detail, pages, ...(scanned ? { provisional: provisional ? decisionDetail(provisional.decision) : null } : {}) };
  await escalate(deps.pool, ids, outcome.reason, detail);
  if (provisional) await storeProvisional(deps, ids, provisional);
}

/** Parse, type, check the structure, then compare or record why not. Returns early when the run was cancelled meanwhile. */
async function compareOnce(deps: CompareDeps, run: Run, ids: EmailRunIds): Promise<void> {
  const set = await promptSetOf(deps.pool, run);
  const files = await attachments.listForEmail(deps.pool, run.id, ids.emailId);
  const docs = files.length > 0 ? await typeDocuments(deps, set, await parseDocuments(deps, ids, files), ids) : [];
  const request = files.length === 0 ? await readRequest(deps, set, ids) : null;
  if ((await runs.status(deps.pool, run.id)) === "cancelled") return;

  const outcome = checkStructure(docs, request);
  if (outcome.kind === "review") {
    await escalateStructure(deps, set, ids, docs, outcome);
    return;
  }
  if (outcome.kind === "awaiting_draft") {
    await comparisons.upsert(deps.pool, { emailRunId: ids.emailRunId, status: "OK", reviewReason: null, detail: outcome.detail });
    await emailRuns.moveStage(deps.pool, ids.runId, ids.emailId, ["comparing"], "done", { outcome: "OK", finished: true });
    log.info({ runId: ids.runId, emailId: ids.emailId, stage: "compare", outcome: outcome.kind }, "compared");
    return;
  }
  if (outcome.swapped) {
    log.warn(
      { runId: ids.runId, emailId: ids.emailId, stage: "compare", si: outcome.si, bl: outcome.bl },
      "the file names had the pair the other way round; the model's reading decided",
    );
  }
  await compareDocuments(deps, set, ids, docs, outcome);
}

/**
 * The compare stage: every attachment parsed and typed, the three structural
 * escalations, and for a pair that can be compared the field extraction, the
 * judge and the verdict. A job can run twice; every write here is idempotent
 * and every stage move names the stages it may start from.
 */
export async function processCompare(deps: CompareDeps, data: CompareJob): Promise<void> {
  const { runId, emailId } = data;
  const run = await runs.get(deps.pool, runId);
  if (!run) throw new TerminalError(`run ${runId} does not exist`);
  if (run.status === "cancelled") return;

  const emailRunId = await emailRuns.idOf(deps.pool, runId, emailId);
  if (!emailRunId) throw new TerminalError(`email ${emailId} is not in run ${runId}`);

  // From `classified` or `comparing` only: a second pass over a finished email changes nothing.
  if (!(await emailRuns.moveStage(deps.pool, runId, emailId, ["classified", "comparing"], "comparing"))) return;
  await compareOnce(deps, run, { runId, emailId, emailRunId });
}
