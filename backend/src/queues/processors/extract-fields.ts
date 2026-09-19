import { extractFields, type ExtractionRole, type ExtractOutput, promptFor, verifyExtraction } from "../../agents";
import { config } from "../../config";
import { ComparisonField, type PromptSet } from "../../contracts";
import { TerminalError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import { extractions } from "../../ontology/repositories";
import { checkEvidence, type Doubt, type ExtractedFields, fieldsInDoubt, unlocated } from "../../pipeline/compare";
import type { CompareDeps } from "./compare.processor";
import type { EmailRunIds } from "./ids";
import type { ParsedDocument } from "./parse-documents";

const log = childLogger({ module: "extract-fields" });

const TEXT_CUT = "\n[the text was cut here for length]";

/** The seven fields as they will be stored: the values, and per field whether the text bears each out. */
interface Read {
  fields: ExtractedFields;
  evidenceOk: Record<ComparisonField, boolean>;
}

/** A field given up on carries no evidence, whatever its null value would pass on its own. */
function withEvidence(fields: ExtractedFields, text: string, unproven: Set<ComparisonField>): Read {
  const evidenceOk = Object.fromEntries(
    ComparisonField.options.map((field) => [field, !unproven.has(field) && checkEvidence(text, fields[field]).ok]),
  ) as Record<ComparisonField, boolean>;
  return { fields, evidenceOk };
}

/**
 * The verifier's word on the fields in doubt, and the first reading's on the
 * rest: a proven field is never replaced by a re-copy of it. A field still
 * unproven after the second reading is not given: a value that cannot be found
 * is uncertainty, and the pair goes to a person.
 */
function merged(text: string, first: ExtractOutput, second: ExtractOutput, doubts: Doubt[]): Read {
  const fields = { ...first };
  for (const doubt of doubts) fields[doubt.field] = second[doubt.field];
  const unproven = new Set<ComparisonField>();
  for (const doubt of fieldsInDoubt(text, fields)) {
    if (doubt.reason === "low_confidence") continue;
    fields[doubt.field] = unlocated(fields[doubt.field], "the verifier could not locate this value in the document");
    unproven.add(doubt.field);
  }
  return withEvidence(fields, text, unproven);
}

/**
 * A second reading of the fields in doubt. A verifier whose answer never fits
 * its schema degrades rather than failing the email: the fields it was asked
 * about become unlocated and a person sees them. An outage is not caught here
 * and pauses the queue as everywhere.
 */
async function verified(deps: CompareDeps, set: PromptSet, input: { role: ExtractionRole; doc: ParsedDocument; text: string }, first: ExtractOutput, doubts: Doubt[], ids: EmailRunIds): Promise<Read> {
  const prompt = promptFor("extract-verify", set);
  try {
    const second = await verifyExtraction(deps, prompt, { role: input.role, format: input.doc.format, text: input.text, first, doubts }, ids);
    return merged(input.text, first, second.value, doubts);
  } catch (error) {
    if (!(error instanceof TerminalError)) throw error;
    log.warn({ ...ids, stage: "extract", filename: input.doc.filename, err: error.message }, "verifier failed for good; the fields in doubt stand as not given");
    const fields = { ...first };
    for (const doubt of doubts) fields[doubt.field] = unlocated(first[doubt.field], `the verifier failed: ${error.message}`);
    return withEvidence(fields, input.text, new Set(doubts.map((doubt) => doubt.field)));
  }
}

/**
 * The seven fields of one document, read once. An extraction already stored
 * under the run's prompt version is read back instead of paid for again, with a
 * person's corrections applied. Otherwise: extract, check the evidence, verify
 * what is in doubt, store the result with its evidence.
 */
export async function extractDocument(deps: CompareDeps, set: PromptSet, doc: ParsedDocument, role: ExtractionRole, ids: EmailRunIds): Promise<ExtractedFields> {
  const prompt = promptFor("extract", set);
  const stored = await extractions.forDocument(deps.pool, doc.id);
  if (stored && stored.promptVersion === prompt.version) return extractions.withHumanValues(stored);
  if (doc.text === null) throw new TerminalError(`${doc.filename} has no text to extract from`);

  const text = doc.text.length > config.EXTRACT_TEXT_CHARS ? doc.text.slice(0, config.EXTRACT_TEXT_CHARS) + TEXT_CUT : doc.text;
  const first = await extractFields(deps, prompt, { role, format: doc.format, text }, ids);
  const doubts = fieldsInDoubt(text, first.value);
  const read = doubts.length > 0 ? await verified(deps, set, { role, doc, text }, first.value, doubts, ids) : withEvidence(first.value, text, new Set());

  await extractions.replace(deps.pool, {
    documentId: doc.id,
    emailRunId: ids.emailRunId,
    role,
    promptVersion: prompt.version,
    model: first.model,
    verified: doubts.length > 0,
    fields: read.fields,
    evidenceOk: read.evidenceOk,
  });
  log.info({ ...ids, stage: "extract", filename: doc.filename, role, verified: doubts.length > 0, doubts: doubts.length }, "extracted");
  return read.fields;
}
