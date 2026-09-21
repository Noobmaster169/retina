import type { PromptStep } from "../contracts";

/**
 * What each model step is doing, in the words a documentation clerk would use.
 * The run page shows these on a queue slot rather than the step name, per
 * docs/05-design.md section 2.1 principle 8: the step name is true and it is
 * not what the reader needs.
 *
 * The enum's own name still appears wherever it is the subject (the pinned
 * prompt list, the trace's model calls). This is for the rows that describe
 * work in progress.
 */
const WORDS: Record<PromptStep, string> = {
  classify: "reading the email",
  "classify-verify": "arguing the other case",
  triage: "deciding what to do with it",
  "doc-type": "naming what each file is",
  extract: "reading both documents",
  "extract-verify": "checking what it read",
  "field-judge": "judging the seven fields",
  "vision-read": "looking at the document",
};

/** A step with no entry falls back to its own name rather than to silence. */
export function stepWords(step: string): string {
  return WORDS[step as PromptStep] ?? step;
}

/**
 * How an email's attachments read on a queued row: "two files, txt and pdf".
 * The formats, not the names, because the names are the email id repeated.
 */
const COUNTS = ["no files", "one file", "two files", "three files", "four files"] as const;

export function filesWords(filenames: string[]): string {
  if (filenames.length === 0) return "";
  const formats = filenames.map((name) => name.split(".").pop()?.toLowerCase() || "file");
  const count = COUNTS[filenames.length] ?? `${filenames.length} files`;
  const listed = formats.length === 1 ? formats[0] : `${formats.slice(0, -1).join(", ")} and ${formats.at(-1)}`;
  return `${count}, ${listed}`;
}
