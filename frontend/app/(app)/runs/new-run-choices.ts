import type { PromptStep } from "@/lib/api/runs-schemas";

import type { Choice } from "./labelled-select";

/**
 * The other two decisions a new run carries: how fast to feed it, and which
 * step each dropdown behind the disclosure belongs to. Here rather than in the
 * form so that file stays the form; what a run reads is `inbox-scope.ts`.
 */

export const PACES: Choice[] = [
  { value: "0", label: "All at once", hint: "Every email is queued immediately; the queues' own concurrency sets the pace" },
  { value: "0.5", label: "One every 2 seconds" },
  { value: "1", label: "One a second" },
  { value: "2", label: "Two a second" },
  { value: "5", label: "Five a second" },
];

/** One dropdown per model step, in the order the pipeline runs them. */
export const STEPS: { step: PromptStep; label: string }[] = [
  { step: "classify", label: "Classify" },
  { step: "classify-verify", label: "Verifier" },
  { step: "triage", label: "Triage" },
  { step: "doc-type", label: "Document type" },
  { step: "extract", label: "Extractor" },
  { step: "extract-verify", label: "Extraction verifier" },
  { step: "field-judge", label: "Field judge" },
];
