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
import { checkStructure, type DocumentSummary, type TriageRequest } from "../../pipeline/compare";
import { keys, type ObjectStore } from "../../storage";
import type { CompareJob } from "../names";
import { escalate } from "./escalate";
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

interface Ids {
  runId: string;
  emailId: string;
  emailRunId: string;
}

const TEXT_CUT = "\n[the text was cut here for length]";

/** The model's word on what each readable document is. A document already typed is not asked about again. */
async function typeDocuments(deps: CompareDeps, set: PromptSet, docs: ParsedDocument[], ids: Ids): Promise<ParsedDocument[]> {
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
async function readRequest(deps: CompareDeps, set: PromptSet, ids: Ids): Promise<TriageRequest> {
  const prompt = promptFor("triage", set);
  const earlier = TriageOutput.safeParse(await llmCalls.latestAccepted(deps.pool, ids.emailRunId, "triage", prompt.version));
  if (earlier.success) return earlier.data.request;
  const email = await emails.get(deps.pool, ids.emailId);
  if (!email) throw new TerminalError(`email ${ids.emailId} is not stored`);
  const input = buildClassifyInput(email, [], config.CLASSIFY_BODY_CHARS);
  return (await triageRequest(deps, prompt, input, ids)).value.request;
}

/** Page images of every PDF among the documents, for the reviewer. A file that will not open has none. */
async function renderPages(deps: CompareDeps, docs: ParsedDocument[], ids: Ids): Promise<string[]> {
  const pages: string[] = [];
  for (const doc of docs.filter((d) => d.format === "pdf")) {
    const rendered = await deps.docExtract.render({
      key: doc.objectKey,
      filename: doc.filename,
      outPrefix: keys.pages(ids.runId, ids.emailId, doc.filename),
    });
    pages.push(...rendered.pages.map((page) => page.key));
  }
  return pages;
}

function summarise(doc: ParsedDocument): DocumentSummary {
  return {
    filename: doc.filename,
    role: doc.role,
    docType: doc.docType,
    bytes: doc.text === null ? 0 : Buffer.byteLength(doc.text),
    format: doc.format,
    unreadable: doc.unreadable,
    scanned: doc.scanned,
    warnings: doc.warnings,
    docTypeConfidence: doc.docTypeConfidence,
    docTypeRationale: doc.docTypeRationale,
  };
}

/** Parse, type, check the structure, then record what it found. Null when the run was cancelled meanwhile. */
async function compareOnce(deps: CompareDeps, run: Run, ids: Ids): Promise<void> {
  const set = await promptSetOf(deps.pool, run);
  const files = await attachments.listForEmail(deps.pool, run.id, ids.emailId);
  const docs = files.length > 0 ? await typeDocuments(deps, set, await parseDocuments(deps, ids, files), ids) : [];
  const request = files.length === 0 ? await readRequest(deps, set, ids) : null;
  if ((await runs.status(deps.pool, run.id)) === "cancelled") return;

  const outcome = checkStructure(docs.map(summarise), request);
  if (outcome.kind === "review") {
    const pages = outcome.reason === "unreadable" ? await renderPages(deps, docs, ids) : [];
    await escalate(deps.pool, ids, outcome.reason, { ...outcome.detail, pages });
    return;
  }
  const detail = outcome.kind === "awaiting_draft" ? outcome.detail : { placeholder: true, si: outcome.si, bl: outcome.bl, extras: outcome.extras };
  await comparisons.upsert(deps.pool, { emailRunId: ids.emailRunId, status: "OK", reviewReason: null, detail });
  await emailRuns.moveStage(deps.pool, ids.runId, ids.emailId, ["comparing"], "done", { outcome: "OK", finished: true });
  log.info({ runId: ids.runId, emailId: ids.emailId, stage: "compare", outcome: outcome.kind }, "compared");
}

/**
 * The compare stage in its phase 5 form: every attachment parsed and typed,
 * the three structural escalations, and a placeholder OK for a pair that could
 * be compared. Field extraction is phase 6. A job can run twice; every write
 * here is idempotent and every stage move names the stages it may start from.
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
