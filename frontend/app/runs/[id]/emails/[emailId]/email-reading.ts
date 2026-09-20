import type { ChatScope } from "@/components/email/chat-rail";
import type { Tone } from "@/components/ui/chip";
import type { EmailTrace } from "@/lib/api/trace-schemas";

/**
 * How one email reads at the top of its page. The status is the organisers'
 * own enum, taken from the comparison the backend already decided; nothing
 * here works one out.
 */

/** The chip beside the subject. `not_comparable` is the run's word for an email that never reached a check. */
export function statusOf(trace: EmailTrace): { value: string; tone: Tone } {
  if (trace.stage === "failed") return { value: "failed", tone: "fault" };
  if (trace.review) return { value: "NEEDS_REVIEW", tone: "review" };
  const status = trace.comparison?.status;
  if (status === "OK") return { value: "OK", tone: "match" };
  if (status === "MISMATCH") return { value: "MISMATCH", tone: "differ" };
  if (trace.classification) return { value: "not_comparable", tone: "neutral" };
  return { value: trace.stage, tone: "neutral" };
}

/** Exactly what a conversation about this email would be able to see. Every chip is a real count. */
export function chatScope(trace: EmailTrace): ChatScope[] {
  return [
    { label: trace.emailId },
    { label: `${trace.documents.length} document${trace.documents.length === 1 ? "" : "s"}` },
    { label: `${trace.calls.length} call${trace.calls.length === 1 ? "" : "s"}` },
  ];
}

/** The turn the conversation would open with: what Retina found, in its own words. */
export function openingLine(trace: EmailTrace): string {
  if (trace.review) {
    return `This email is waiting for a person because of ${trace.review.reason}. Nothing was read from the document that failed, and nothing was guessed.`;
  }
  const comparison = trace.comparison;
  if (!comparison) {
    return trace.classification
      ? `Sorted as ${trace.classification.finalCategory}, so no document check was asked for.`
      : "Nothing has been decided about this email yet.";
  }
  if (comparison.defectFields.length === 0) {
    return `All ${comparison.fields.length} fields agree across the two documents.`;
  }
  const named = comparison.defectFields.join(" and ");
  return `${comparison.defectFields.length} of the ${comparison.fields.length} fields differ: ${named}. The rest agree.`;
}
