const LABELS: Record<string, string> = {
  OK: "Documents match",
  MISMATCH: "Documents don't match",
  NEEDS_REVIEW: "Needs review",
  awaiting_draft: "Needs a draft",
  wrong_doc_type: "Wrong document",
  missing_attachment: "Missing attachment",
  unreadable: "Unreadable",
  missing_value: "Missing value",
  ingested: "Received",
  classifying: "Classifying",
  classified: "Classified",
  comparing: "Checking documents",
  review: "Needs review",
  done: "Done",
  failed: "Couldn't finish",
};

/** Keep stored values exact while making every visible state readable. */
export function displayLabel(value: string): string {
  return LABELS[value] ?? sentenceCase(value.replaceAll("_", " "));
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
