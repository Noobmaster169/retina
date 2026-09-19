import { judgeFields, promptFor } from "../../agents";
import type { PromptSet } from "../../contracts";
import { TerminalError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import { comparisons, emailRuns, fieldDiffs } from "../../ontology/repositories";
import { assemble, type Assembled, decide, type Decision, decisionDetail, judgeable, resolveRoles, type StructureOutcome } from "../../pipeline/compare";
import type { CompareDeps } from "./compare.processor";
import { escalate } from "./escalate";
import { extractDocument } from "./extract-fields";
import type { EmailRunIds } from "./ids";
import type { ParsedDocument } from "./parse-documents";

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

/** Extract both sides, ask the judge about every field with a value on both, assemble, decide. Writes the extractions; nothing else. */
export async function judgePair(deps: CompareDeps, set: PromptSet, ids: EmailRunIds, docs: ParsedDocument[], pair: Pair): Promise<Judged> {
  const si = await extractDocument(deps, set, documentNamed(docs, pair.si), "SI", ids);
  const bl = await extractDocument(deps, set, documentNamed(docs, pair.bl), "BL", ids);
  const fields = judgeable(si, bl);
  const judged = fields.length > 0 ? (await judgeFields(deps, promptFor("field-judge", set), { si, bl, fields }, ids)).value : {};
  const assembled = assemble(si, bl, judged);
  return { assembled, decision: decide(assembled) };
}

/** The judgements stored against the email's comparison row, which must exist by now. */
async function storeJudgements(deps: CompareDeps, ids: EmailRunIds, assembled: Assembled): Promise<void> {
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
): Promise<void> {
  const { assembled, decision } = await judgePair(deps, set, ids, docs, outcome);
  const pairing = { si: outcome.si, bl: outcome.bl, extras: outcome.extras, swapped: outcome.swapped };
  const detail = { ...pairing, ...decisionDetail(decision) };

  if (decision.status === "NEEDS_REVIEW" && decision.reviewReason) {
    await escalate(deps.pool, ids, decision.reviewReason, detail);
    await storeJudgements(deps, ids, assembled);
    return;
  }
  await comparisons.upsert(deps.pool, { emailRunId: ids.emailRunId, status: decision.status, reviewReason: null, detail });
  await storeJudgements(deps, ids, assembled);
  await emailRuns.moveStage(deps.pool, ids.runId, ids.emailId, ["comparing"], "done", { outcome: decision.status, finished: true });
  log.info({ ...ids, stage: "compare", status: decision.status, defectFields: decision.defectFields }, "compared");
}

/**
 * For a scanned pair: the comparison run on the OCR text, so the reviewer sees
 * a suggested result beside the page images. Null when the scan does not make
 * a pair. The email is still escalated as unreadable; this never decides it.
 */
export async function provisionalResult(deps: CompareDeps, set: PromptSet, ids: EmailRunIds, docs: ParsedDocument[]): Promise<Judged | null> {
  const roles = resolveRoles(docs.filter((doc) => doc.text !== null));
  const si = roles.attachments.find((file) => file.role === "SI");
  const bl = roles.attachments.find((file) => file.role === "BL");
  if (!si || !bl) return null;
  return judgePair(deps, set, ids, docs, { si: si.filename, bl: bl.filename });
}

/** After the unreadable escalation is written: the provisional judgements kept where the trace reads them. */
export async function storeProvisional(deps: CompareDeps, ids: EmailRunIds, judged: Judged): Promise<void> {
  await storeJudgements(deps, ids, judged.assembled);
}
