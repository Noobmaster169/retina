import type { DocType, DocumentFormat, ReviewReason } from "../../contracts";
import { resolveRoles, type RoledDocument, triage, type TriageRequest } from "./triage";

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
  | { kind: "compare"; si: string; bl: string; extras: string[] };

const NOT_A_SHIPPING_DOCUMENT: DocType[] = ["INVOICE", "PACKING_LIST", "COO", "OTHER"];

/**
 * The structural check before any field is read: are the documents there, can
 * they be read, and are they what they claim to be. Escalation precedence when
 * several apply is unreadable, then wrong_doc_type, then missing_attachment.
 *
 * A scan is escalated too: OCR text is never silently trusted. Phase 6 adds a
 * provisional comparison to that case for the reviewer.
 */
export function checkStructure(docs: DocumentSummary[], request: TriageRequest | null): StructureOutcome {
  const unreadable = docs.filter((doc) => doc.unreadable);
  if (unreadable.length > 0) {
    const files = unreadable.map(({ filename, warnings, scanned }) => ({ filename, warnings, scanned }));
    return { kind: "review", reason: "unreadable", detail: { files } };
  }

  const scanned = docs.filter((doc) => doc.scanned);
  if (scanned.length > 0) {
    const files = scanned.map(({ filename, warnings, scanned: isScanned }) => ({ filename, warnings, scanned: isScanned }));
    return { kind: "review", reason: "unreadable", detail: { scanned: true, files, provisional: null } };
  }

  const wrong = docs.filter((doc) => doc.docType !== null && NOT_A_SHIPPING_DOCUMENT.includes(doc.docType));
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

  const result = triage({ request, attachments: resolveRoles(docs) });
  if (result.kind === "awaiting_draft") return { kind: "awaiting_draft", detail: { awaiting_draft: true, note: result.note } };
  if (result.kind === "missing_attachment") {
    const attachments = docs.map((doc) => doc.filename);
    return { kind: "review", reason: "missing_attachment", detail: { missing: result.missing, note: result.note, attachments } };
  }
  return result;
}
