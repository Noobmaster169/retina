import { judgeFields, type JudgeOutput, judgeSchema, promptFor } from "../../agents";
import type { ComparisonField, PromptSet } from "../../contracts";
import { TerminalError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import { comparisons, emailRuns, fieldDiffs, llmCalls } from "../../ontology/repositories";
import { assemble, type Assembled, decide, type Decision, decisionDetail, type ExtractedFields, judgeable, resolveRoles, type StructureOutcome } from "../../pipeline/compare";
import type { CompareDeps } from "./compare.processor";
import { escalate } from "./escalate";
import { extractDocument } from "./extract-fields";
import type { EmailRunIds } from "./ids";
import type { ParsedDocument } from "./parse-documents";
import { resolveCase } from "./resolve-case";

const log = childLogger({ module: "compare-pair" });

export interface Pair {
  si: string;
  bl: string;
}

export interface Judged {
  assembled: Assembled;
  decision: Decision;
}

function documentNamed(docs: ParsedDocument[], filename: string): ParsedDocument {
  const doc = docs.find((d) => d.filename === filename);
  if (!doc) throw new TerminalError(`${filename} is not among the parsed documents`);
  return doc;
}

/**
 * The judge's word on these fields. One call per email, so an answer already
 * paid for on an earlier attempt is reused when it covers the same fields.
 *
 * `fresh` is a rerun a person set off: their correction or their upload changed
 * what is being judged, so the earlier answer is about a pair that no longer
 * exists and reusing it would ignore the correction it was asked for.
 */
async function judged(deps: CompareDeps, set: PromptSet, ids: EmailRunIds, si: ExtractedFields, bl: ExtractedFields, fields: ComparisonField[], fresh: boolean): Promise<JudgeOutput> {
  if (fields.length === 0) return {};
  const prompt = promptFor("field-judge", set);
  const earlier = fresh ? null : judgeSchema(fields).safeParse(await llmCalls.latestAccepted(deps.pool, ids.emailRunId, "field-judge", prompt.version));
  if (earlier?.success) return earlier.data;
  return (await judgeFields(deps, prompt, { si, bl, fields }, ids)).value;
}

/** Extract both sides, ask the judge about every field with a value on both, assemble, decide. Writes the extractions; nothing else. */
export async function judgePair(deps: CompareDeps, set: PromptSet, ids: EmailRunIds, docs: ParsedDocument[], pair: Pair, fresh: boolean): Promise<Judged> {
  const si = await extractDocument(deps, set, documentNamed(docs, pair.si), "SI", ids);
  const bl = await extractDocument(deps, set, documentNamed(docs, pair.bl), "BL", ids);
  const assembled = assemble(si, bl, await judged(deps, set, ids, si, bl, judgeable(si, bl), fresh));
  return { assembled, decision: decide(assembled) };
}

/**
 * The comparison row and every field's judgement, written before the email
 * moves on so that a retry after a failed write finds them missing and writes
 * them again. `escalate` and the OK path upsert the same row afterwards.
 */
async function storeComparison(deps: CompareDeps, ids: EmailRunIds, row: { decision: Decision; detail: Record<string, unknown>; assembled: Assembled }): Promise<void> {
  const { decision, detail, assembled } = row;
  await comparisons.upsert(deps.pool, { emailRunId: ids.emailRunId, status: decision.status, reviewReason: decision.reviewReason, detail });
  const comparisonId = await comparisons.idFor(deps.pool, ids.emailRunId);
  if (!comparisonId) throw new TerminalError(`no comparison row for email run ${ids.emailRunId}`);
  await fieldDiffs.replaceAll(deps.pool, comparisonId, assembled.fields);
}

/**
 * A pair that can be compared: the full check, then the organisers' verdict.
 * A missing value on either side is the fourth review reason; otherwise the
 * pair ends OK or MISMATCH with its defect fields, and the email is done.
 */
export async function compareDocuments(
  deps: CompareDeps,
  set: PromptSet,
  ids: EmailRunIds,
  docs: ParsedDocument[],
  outcome: Extract<StructureOutcome, { kind: "compare" }>,
  fresh: boolean,
): Promise<void> {
  const { assembled, decision } = await judgePair(deps, set, ids, docs, outcome, fresh);
  const detail = { si: outcome.si, bl: outcome.bl, extras: outcome.extras, swapped: outcome.swapped, ...decisionDetail(decision) };
  await storeComparison(deps, ids, { decision, detail, assembled });

  if (decision.status === "NEEDS_REVIEW" && decision.reviewReason) {
    await escalate(deps.pool, ids, decision.reviewReason, detail);
    return;
  }
  await emailRuns.moveStage(deps.pool, ids.runId, ids.emailId, ["comparing"], "done", { outcome: decision.status, finished: true });
  await resolveCase(deps.pool, ids);
  log.info({ ...ids, stage: "compare", status: decision.status, defectFields: decision.defectFields }, "compared");
}

/**
 * For a scanned pair: the comparison run on the OCR text, so the reviewer sees
 * a suggested result beside the page images. The verdict is already
 * `unreadable`, so a comparison that fails for good (an answer that never fits
 * its schema on garbled text) leaves the suggestion out rather than failing the
 * email; an outage still pauses the queue. Null when the scan makes no pair.
 */
export async function provisionalResult(deps: CompareDeps, set: PromptSet, ids: EmailRunIds, docs: ParsedDocument[], fresh: boolean): Promise<Judged | null> {
  const roles = resolveRoles(docs.filter((doc) => doc.text !== null));
  const si = roles.attachments.find((file) => file.role === "SI");
  const bl = roles.attachments.find((file) => file.role === "BL");
  if (!si || !bl) return null;
  try {
    return await judgePair(deps, set, ids, docs, { si: si.filename, bl: bl.filename }, fresh);
  } catch (error) {
    if (!(error instanceof TerminalError)) throw error;
    log.warn({ ...ids, stage: "compare", err: error.message }, "no provisional result for the scanned pair; the escalation stands");
    return null;
  }
}

/** The scanned pair's escalation with its provisional result, judgements stored first as on every other path. */
export async function escalateScanned(deps: CompareDeps, ids: EmailRunIds, detail: Record<string, unknown>, provisional: Judged | null): Promise<void> {
  const full = { ...detail, provisional: provisional ? decisionDetail(provisional.decision) : null };
  const unreadable: Decision = { status: "NEEDS_REVIEW", reviewReason: "unreadable", defectFields: [], missing: [] };
  if (provisional) await storeComparison(deps, ids, { decision: unreadable, detail: full, assembled: provisional.assembled });
  await escalate(deps.pool, ids, "unreadable", full);
}
