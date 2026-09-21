import type { DocType, DocumentFormat, ReviewReason, TypeVerdict } from "../../contracts";
import { resolveRoles, type ResolvedRoles, type RoledDocument, triage, type TriageRequest } from "./triage";

export interface DocumentSummary extends RoledDocument {
  format: DocumentFormat;
  unreadable: boolean;
  scanned: boolean;
  warnings: string[];
  docTypeConfidence: number | null;
  docTypeRationale: string | null;
}

export type StructureOutcome =
  | { kind: "review"; reason: ReviewReason; detail: Record<string, unknown> }
  | { kind: "awaiting_draft"; detail: Record<string, unknown> }
  | { kind: "compare"; si: string; bl: string; extras: string[]; swapped: boolean };

/** The two kinds this check is for. Anything else in a place meant for one of them is the wrong document. */
const SHIPPING_DOCUMENTS: DocType[] = ["SI", "BL"];

/**
 * Below this, the model's word on what a document is does not displace the file
 * name's claim. Parking an email costs a person either way, so a reading the
 * model itself is unsure of is not enough to do it, any more than no reading at
 * all is. The one calibration point on this prompt is the xlsx BL the model read
 * as an SI at 0.62; no holdout run stands behind the number yet, and
 * docs/PROGRESS.md carries that under Deferred.
 */
export const DOC_TYPE_TRUST_FROM = 0.7;

function verdictsFor(docs: DocumentSummary[], roles: ResolvedRoles): Map<string, TypeVerdict> {
  const roleOf = new Map(roles.attachments.map((file) => [file.filename, file.role]));
  return new Map(
    docs.map((doc) => {
      // A file that fills no place in the pair came along with it, and its kind
      // is not this check's business: an invoice travels with shipping paperwork
      // all the time.
      const role = roleOf.get(doc.filename);
      const inThePair = role !== undefined && role !== "UNKNOWN";
      if (doc.docType === null) return [doc.filename, "unknown"];
      if (inThePair && !SHIPPING_DOCUMENTS.includes(doc.docType) && (doc.docTypeConfidence ?? 0) >= DOC_TYPE_TRUST_FROM) {
        return [doc.filename, "wrong_type"];
      }
      if (inThePair && roles.swapped) return [doc.filename, "crossed"];
      return [doc.filename, "ok"];
    }),
  );
}

/**
 * How each document's reading stands against the place its file name claims,
 * for anything that shows the documents to a person. The same reading the
 * structural check acts on, so a page can never disagree with the verdict.
 */
export function documentVerdicts(docs: DocumentSummary[]): Map<string, TypeVerdict> {
  return verdictsFor(docs, resolveRoles(docs));
}

/**
 * The structural check before any field is read: are the documents there, can
 * they be read, and are they what they claim to be. Escalation precedence when
 * several apply is unreadable, then wrong_doc_type, then missing_attachment.
 *
 * A document that was read by looking at it is not escalated for that reason. It
 * has text like any other, and `unreadable` now means what a person means by it:
 * nobody could read this, a reader with eyes included. A scan escalated on sight
 * made a clean bill of lading and a truncated file mean the same thing, and the
 * only judgement it really encoded was that a character recogniser was not
 * trusted, which is a fact about the recogniser and not about the document.
 */
export function checkStructure(docs: DocumentSummary[], request: TriageRequest | null): StructureOutcome {
  const unreadable = docs.filter((doc) => doc.unreadable);
  if (unreadable.length > 0) {
    const files = unreadable.map(({ filename, warnings, scanned }) => ({ filename, warnings, scanned }));
    return { kind: "review", reason: "unreadable", detail: { files } };
  }

  const roles = resolveRoles(docs);
  const verdicts = verdictsFor(docs, roles);
  const wrong = docs.filter((doc) => verdicts.get(doc.filename) === "wrong_type");
  if (wrong.length > 0) {
    const files = wrong.map((doc) => ({
      filename: doc.filename,
      claimed: doc.role,
      detected: doc.docType,
      confidence: doc.docTypeConfidence,
      rationale: doc.docTypeRationale,
    }));
    return { kind: "review", reason: "wrong_doc_type", detail: { files } };
  }

  const result = triage({ request, attachments: roles.attachments });
  if (result.kind === "awaiting_draft") return { kind: "awaiting_draft", detail: { awaiting_draft: true, note: result.note } };
  if (result.kind === "missing_attachment") {
    const names = docs.map((doc) => doc.filename);
    return { kind: "review", reason: "missing_attachment", detail: { missing: result.missing, note: result.note, attachments: names } };
  }
  return { ...result, swapped: roles.swapped };
}
