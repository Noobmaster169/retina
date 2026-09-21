import type { Tone } from "@/components/ui/chip";
import type { EmailTrace } from "@/lib/api/trace-schemas";

import { classificationLabel } from "./classification-chip";
import { displayLabel } from "./display-label";

/**
 * How one email reads at the top of its page. The status is the organisers'
 * own enum, taken from the comparison the backend already decided; nothing
 * here works one out.
 */

/** The plain-language chip beside the subject. Stored enums never leak into the working view. */
export function statusOf(trace: EmailTrace): { value: string; tone: Tone } {
  if (trace.stage === "failed") return { value: "Failed", tone: "fault" };
  if (trace.review) return { value: "Needs review", tone: "review" };
  const status = trace.comparison?.status;
  if (status === "OK") return { value: "Agreed", tone: "match" };
  if (status === "MISMATCH") return { value: "Differences", tone: "differ" };
  if (trace.classification) {
    return { value: classificationLabel(trace.classification.humanCategory ?? trace.classification.finalCategory), tone: "accent" };
  }
  return { value: displayLabel(trace.stage), tone: "neutral" };
}

/**
 * The turn the conversation would open with: everything Retina found about
 * this email, in its own words. It is the reading the right pane used to be
 * for, so it says as much as that pane did rather than one line: what differs,
 * and which of the agreeing fields the judge had to think about.
 */
export function openingLine(trace: EmailTrace): string {
  if (trace.review) return reviewOpening(trace, trace.review);
  const comparison = trace.comparison;
  if (!comparison) {
    return trace.classification
      ? `Sorted as ${classificationLabel(trace.classification.humanCategory ?? trace.classification.finalCategory)}, so no document check was needed.`
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

function reviewOpening(trace: EmailTrace, review: NonNullable<EmailTrace["review"]>): string {
  if (review.kind === "failure") {
    return `This email stopped while ${displayLabel(review.stage).toLowerCase()} before anything was decided about it. Nothing was guessed, and nothing about the email itself is wrong.`;
  }
  const reason = review.reason ? displayLabel(review.reason).toLowerCase() : "a reason it did not record";
  const unread = trace.documents.find((document) => document.unreadable);
  const scanned = trace.documents.find((document) => document.scanned);
  const at = (document: { pageConfidence: number[] }) =>
    document.pageConfidence.length ? ` Its pages came back at ${document.pageConfidence.map((page) => Math.round(page)).join(", ")} percent, against a 40 percent floor.` : "";

  if (unread) return `${unread.filename} could not be read, so this is parked as ${reason}.${at(unread)} Nothing was read from it and nothing was guessed.`;
  // A scan that OCR did read is still parked: recognised text is never settled
  // on without a person, whatever the comparison came out as.
  if (scanned) return `${scanned.filename} is a scan, so it was read by OCR.${at(scanned)} That is never settled without a person, so this is parked as ${reason}.`;
  return `This email is waiting for a person because of ${reason}. Nothing was guessed.`;
}

function list(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
