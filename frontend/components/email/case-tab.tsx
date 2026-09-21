"use client";

import { Chip } from "@/components/ui/chip";
import type { EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";

import { CaseActions } from "./case-actions";
import { CaseFields, type Correcting } from "./case-fields";
import { FailureBody } from "./case-failure";
import { CaseHistory } from "./case-history";
import { CaseReason } from "./case-reason";
import { displayLabel } from "./display-label";
import { MessageCard, type Message } from "./message-card";
import { Reading, Seam } from "./seam";

/**
 * The same page as the check, with a case instead. Under the seam the reading
 * comes first in words, then why Retina stopped, then whatever answers that
 * question for this reason, then what people have done about it.
 *
 * Violet throughout for an escalation: uncertainty handed to a person, not a
 * fault. A job that failed is red instead, because that one is a fault, and
 * section 4.4 never lets the two share a badge.
 */

interface CaseTabProps {
  trace: EmailTrace;
  message: Message;
  review: ReviewCaseView;
  /** Present while the case is open, so a value can be corrected on the row it belongs to. */
  correcting?: Correcting;
}

export function CaseTab({ trace, message, review, correcting }: CaseTabProps) {
  const failure = review.kind === "failure";
  return (
    <div className="px-6">
      <div className="pt-4">
        <MessageCard message={message} documents={trace.documents} actions={<CaseActions trace={trace} review={review} />} />
      </div>
      <Seam />
      <Reading facts={factsOf(trace, review)}>{readingOf(trace, review)}</Reading>

      <div className="flex h-[34px] items-center gap-2">
        <h2 className="shrink-0 text-[14px] font-semibold tracking-[-0.01em]">{failure ? "Retina could not finish" : "Retina stopped here"}</h2>
        {/* The heading holds its line: this row is a fixed height, and a standing
            note long enough to wrap used to push the chip out of the panel. */}
        <span className="min-w-0 truncate text-small text-ink-tertiary">{standing(review)}</span>
        <span className="grow" />
        <Chip tone={failure ? "fault" : "review"}>
          {displayLabel(review.reason ?? "failed")}
        </Chip>
      </div>

      {failure ? <FailureBody review={review} /> : <CaseReason trace={trace} review={review} />}
      {failure ? null : <CaseFields trace={trace} correcting={correcting} />}
      <CaseHistory actions={review.actions} />
    </div>
  );
}

/** How long it has been waiting, or who settled it. The page never says a case is assigned: nothing assigns one. */
function standing(review: ReviewCaseView): string {
  if (review.status === "resolved") return `Settled by ${review.resolvedBy ?? "a rerun"}`;
  return `Opened ${opened(review.openedAt)}, nobody assigned`;
}

function readingOf(trace: EmailTrace, review: ReviewCaseView): string {
  if (review.kind === "failure") {
    return `This email stopped while ${displayLabel(review.stage).toLowerCase()}. Nothing was decided about it and nothing was guessed.`;
  }
  const readable = trace.documents.filter((document) => !document.unreadable).length;
  const opened = trace.documents.length;
  if (opened === 0) return "No attachment reached the parser, so there was nothing to compare.";
  return `${readable} of the ${opened} attachment${opened === 1 ? "" : "s"} read cleanly. Nothing was guessed from the rest.`;
}

function factsOf(trace: EmailTrace, review: ReviewCaseView) {
  if (review.kind === "failure") {
    return [
      { label: "stopped while", value: displayLabel(review.stage).toLowerCase(), tone: "fault" as const },
      { label: "decided", value: "nothing", tone: "neutral" as const },
    ];
  }
  const unread = trace.documents.find((document) => document.unreadable);
  return [
    { label: "needs help with", value: displayLabel(review.reason ?? "failed").toLowerCase(), tone: "review" as const },
    // Whether anything could be looked at at all is the distinction a reviewer acts
    // on: a file that would not open needs a new copy, one that was looked at and
    // could not be made out needs a better scan.
    ...(unread ? [{ label: "what there was", value: unread.scanned ? `${unread.pages} page(s), none legible` : "nothing that would open" }] : []),
  ];
}

function opened(at: string): string {
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
