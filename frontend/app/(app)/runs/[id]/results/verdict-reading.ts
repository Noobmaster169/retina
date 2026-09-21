import type { Tone } from "@/components/ui/chip";
import type { VerifierEffect } from "@/lib/api/scoring-schemas";

import type { CheckName } from "./filters";

/**
 * The words the results table uses. Plain English first, the enum inside it:
 * docs/05-design.md section 2.2. The scored checks keep the scorer's own names
 * in their labels, because a person reading this is about to go and change a
 * prompt and has to know which number moved.
 */

export const CHECK_LABELS: Record<CheckName, string> = {
  category: "Category",
  status: "Status",
  reviewReason: "Review reason",
  defect: "Defect",
  defectFields: "Defect fields",
  endToEnd: "End to end",
};

/** What the verifier did, as a sentence, and the hue it earns. A save is a match, a break is a fault. */
export const EFFECTS: Record<VerifierEffect, { label: string; sentence: string; tone: Tone }> = {
  not_run: {
    label: "did not run",
    sentence: "The generator was sure enough that no second call was made.",
    tone: "neutral",
  },
  fixed: {
    label: "fixed it",
    sentence: "The generator was wrong and the verifier moved the answer onto the truth.",
    tone: "match",
  },
  broke: {
    label: "broke it",
    sentence: "The generator was right and the verifier moved the answer off the truth.",
    tone: "fault",
  },
  agreed_right: {
    label: "agreed, right",
    sentence: "The verifier read the same email and kept a right answer.",
    tone: "match",
  },
  agreed_wrong: {
    label: "agreed, wrong",
    sentence: "Both readers reached the same wrong category, so the second call bought nothing here.",
    tone: "differ",
  },
  changed_still_wrong: {
    label: "changed, still wrong",
    sentence: "The verifier moved the answer to a third category, which is not the truth either.",
    tone: "differ",
  },
};

/** How many emails are wrong, in words, for the line above the table. */
export function wrongSentence(wrong: number, total: number): string {
  if (total === 0) return "This run holds no email the answer key covers.";
  if (wrong === 0) return `All ${total} right on every check the scorer scores here.`;
  return `${wrong} of ${total} wrong on at least one scored check.`;
}
