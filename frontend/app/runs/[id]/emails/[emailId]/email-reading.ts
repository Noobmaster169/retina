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

/**
 * The turn the conversation would open with: everything Retina found about
 * this email, in its own words. It is the reading the right pane used to be
 * for, so it says as much as that pane did rather than one line: what differs,
 * and which of the agreeing fields the judge had to think about.
 */
export function openingLine(trace: EmailTrace): string {
  if (trace.review) return reviewOpening(trace, trace.review.reason);
  const comparison = trace.comparison;
  if (!comparison) {
    return trace.classification
      ? `Sorted as ${trace.classification.finalCategory}, so no document check was asked for. Nothing was opened and nothing was compared.`
      : "Nothing has been decided about this email yet.";
  }

  const judged = comparison.fields.filter((field) => !field.missing);
  // A field both sides wrote differently and the judge still called the same:
  // the clearest evidence on the page that it judged rather than matched.
  const reworded = judged.filter(
    (field) => field.same && field.siValue !== null && field.blValue !== null && field.siValue !== field.blValue,
  );
  const tail = reworded.length
    ? ` The other ${judged.length - comparison.defectFields.length} agree, including ${list(reworded.map((field) => field.field))} written two ways.`
    : ` The other ${judged.length - comparison.defectFields.length} agree.`;

  if (comparison.defectFields.length === 0) {
    return `All ${judged.length} fields agree across the two documents.${reworded.length ? ` ${sentenceCase(list(reworded.map((field) => field.field)))} ${reworded.length === 1 ? "was" : "were"} written two ways and the judge called ${reworded.length === 1 ? "it" : "them"} the same.` : ""}`;
  }
  return `${comparison.defectFields.length} of the ${judged.length} fields name different things: ${list(comparison.defectFields)}.${tail}`;
}

function reviewOpening(trace: EmailTrace, reason: string): string {
  const unread = trace.documents.find((document) => document.unreadable);
  if (!unread) return `This email is waiting for a person because of ${reason}. Nothing was guessed.`;
  const pages = unread.pageConfidence;
  const each = pages.length ? ` Its pages came back at ${pages.map((page) => `${Math.round(page * 100)}`).join(", ")} percent, under the 40 percent floor.` : "";
  return `${unread.filename} could not be read, so this is parked as ${reason}.${each} Nothing was read from it and nothing was guessed.`;
}

function list(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
