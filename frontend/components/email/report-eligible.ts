import type { DocumentView, EmailTrace } from "@/lib/api/trace-schemas";

import { rowsOf } from "./check-tab";

/**
 * Whether an email earns a report tab and an export. A field comparison is one
 * kind of report; a wrong document is another, and both are worth forwarding.
 */

export function wrongDocType(trace: EmailTrace): boolean {
  if (trace.review?.reason === "wrong_doc_type") return true;
  return trace.comparison?.reviewReason === "wrong_doc_type";
}

/** Attachments the compare stage flagged as not what their filename claims. */
export function wrongDocuments(trace: EmailTrace): DocumentView[] {
  return trace.documents.filter((document) => document.typeVerdict === "wrong_type");
}

export function hasReport(trace: EmailTrace): boolean {
  return rowsOf(trace).length > 0 || wrongDocType(trace);
}

const DOC_TYPES: Record<string, string> = {
  SI: "Shipping instruction",
  BL: "Bill of lading",
  INVOICE: "Commercial invoice",
  PACKING_LIST: "Packing list",
  COO: "Certificate of origin",
  OTHER: "Other document",
};

/** What the model says a file is, in words a report can use. */
export function docTypeLabel(value: string | null | undefined): string {
  if (!value) return "not typed";
  return DOC_TYPES[value] ?? value.replaceAll("_", " ").toLowerCase();
}

const ROLES: Record<string, string> = {
  SI: "Shipping instruction",
  BL: "Bill of lading",
  UNKNOWN: "Supporting document",
};

/** What the filename claims, in words a report can use. */
export function claimedRoleLabel(value: string): string {
  return ROLES[value] ?? value;
}
