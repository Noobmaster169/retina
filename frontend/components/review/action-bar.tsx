"use client";

import { useState } from "react";

import { ActionStrip, type Armed } from "@/components/review/action-strip";
import type { CaseActions } from "@/components/review/use-case-actions";
import { Button } from "@/components/ui/button";
import type { ReviewCaseView } from "@/lib/api/trace-schemas";

/**
 * Every write this page offers, in the order of docs/03-infra-deep.md section
 * 5.5. What a control needs beyond a click opens as a strip above the bar, so
 * the case stays on screen while it is answered: a correction is never a modal
 * and neither is anything beside it.
 *
 * One action leads. The bar used to be six controls of equal weight in every
 * state, all of them dimmed on an email with no case, which asks a reader to
 * work out which of six applies to them before they can do anything. Each
 * state now names the one thing that actually answers it, says in a line what
 * pressing it records, and keeps the rest to one side.
 *
 * Nothing here arbitrates. `Fill in the blank` records what a person read in
 * one document; it never declares the other one wrong. That is section 11 and
 * it is the reason none of these buttons can be called `Fix`.
 */

interface ActionBarProps {
  /** Null on an email that needs nobody: the bar then says so and offers nothing. */
  review: ReviewCaseView | null;
  actions: CaseActions;
  /** Puts the comparison row a correction belongs on into editing. Absent where there is no row to edit. */
  onCorrect?: () => void;
  /** Who is writing. Empty asks for a name before anything is sent. */
  actor: string;
  onName: (name: string) => void;
}

/** A bad or missing file is answered by a draft to the sender, on the message above. */
const ASKS_SENDER = ["missing_attachment", "unreadable", "wrong_doc_type"];

/** What the leading action records, in the words a person would use for it. */
const SAYS: Record<string, string> = {
  retry: "Sends the email back through from where it stopped.",
  correct: "Records what you read in one document. Retina checks the two again.",
  confirm: "Records that this is as far as the check can go, and closes the case.",
};

export function ActionBar({ review, actions, onCorrect, actor, onName }: ActionBarProps) {
  const [armed, setArmed] = useState<Armed>(null);
  const [more, setMore] = useState(false);

  // An email with no case has nothing for anyone to do, so the bar is not
  // drawn at all. It used to say so in a sentence, which spent sixty pixels of
  // every ordinary email restating what the absence of a case already says.
  if (!review) return null;

  const open = review.status === "open";
  const failure = review.kind === "failure";
  const busy = actions.pending !== null;
  /** A write needs a name on it. Asking at the first write beats a prompt on arrival. */
  const guarded = (run: () => void) => () => (actor ? run() : setArmed("name"));
  const arm = (next: Armed) => () => setArmed(armed === next ? null : next);
  const confirm = guarded(() => void actions.act({ kind: "confirm" }));

  // A job that stopped is retried. A blank value is typed. A file that could
  // not be used is not replaced from here: the message above drafts the ask.
  const asksSender = !failure && review.reason !== null && ASKS_SENDER.includes(review.reason);
  const lead = failure
    ? { key: "retry", label: actions.pending === "retry" ? "Sending it back" : "Try it again", run: guarded(() => void actions.act({ kind: "retry" })) }
    : asksSender
      ? null
      : onCorrect
        ? { key: "correct", label: "Fill in the blank", run: guarded(onCorrect) }
        : { key: "confirm", label: actions.pending === "confirm" ? "Recording" : "Nothing more to add", run: confirm };
  const caption = !open
    ? "This case is settled."
    : asksSender
      ? "Ask the sender for the right file, from the message above."
      : SAYS[lead?.key ?? "confirm"];

  return (
    <div className="shrink-0 border-t border-hairline">
      <ActionStrip armed={armed} onClose={() => setArmed(null)} actions={actions} review={review} actor={actor} onName={onName} />

      <div className="flex min-h-[60px] flex-wrap items-center gap-2 px-6 py-3">
        {lead ? (
          <Button variant="primary" disabled={!open || busy} onClick={lead.run}>
            {lead.label}
          </Button>
        ) : null}
        <span className="min-w-0 grow truncate text-caption text-ink-tertiary">{caption}</span>

        {!failure && lead?.key !== "confirm" ? (
          <Button variant="secondary" disabled={!open || busy} onClick={confirm}>
            {actions.pending === "confirm" ? "Recording" : "Nothing more to add"}
          </Button>
        ) : null}

        <Button variant="quiet" aria-expanded={more} onClick={() => setMore((was) => !was)}>
          {more ? "Fewer" : "More"}
        </Button>
      </div>

      {more ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline-faint px-6 py-2.5">
          {!failure && onCorrect && lead?.key !== "correct" ? (
            <Button variant="quiet" disabled={!open || busy} onClick={guarded(onCorrect)}>
              Fill in the blank
            </Button>
          ) : null}
          {!failure ? (
            <Button variant="quiet" disabled={!open || busy} onClick={guarded(arm("reclassify"))}>
              Sort it differently
            </Button>
          ) : null}
          <Button variant="quiet" disabled={busy} onClick={guarded(arm("note"))}>
            Leave a note
          </Button>
        </div>
      ) : null}
    </div>
  );
}
