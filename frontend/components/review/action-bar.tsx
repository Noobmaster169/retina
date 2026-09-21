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
 * Nothing here arbitrates. `Say what a document reads` records what a person
 * read in one document; it never declares the other one wrong. That is section
 * 11 and it is the reason none of these buttons can be called `Fix`.
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

/** Which reasons are answered by supplying a better document. A missing value is answered by typing it. */
const UPLOADABLE = ["missing_attachment", "unreadable", "wrong_doc_type"];

/** What the leading action records, in the words a person would use for it. */
const SAYS: Record<string, string> = {
  retry: "Sends the email back through the pipeline from where it stopped.",
  upload: "Replaces the file Retina could not read, and judges the pair again.",
  correct: "Records what you read in one document. Retina judges the pair again from both sides.",
  confirm: "Records that stopping here was right, and closes the case.",
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

  // The leading action is whatever actually answers this case: a job that
  // stopped is retried, a file nobody could read is replaced, a blank value is
  // typed. Agreeing that a person was needed is the answer only when none of
  // those is, and it is always available beside them.
  const lead = failure
    ? { key: "retry", label: actions.pending === "retry" ? "Sending it back" : "Try it again", run: guarded(() => void actions.act({ kind: "retry" })) }
    : review.reason && UPLOADABLE.includes(review.reason)
      ? { key: "upload", label: "Upload a readable copy", run: guarded(arm("upload")) }
      : onCorrect
        ? { key: "correct", label: "Say what a document reads", run: guarded(onCorrect) }
        : { key: "confirm", label: actions.pending === "confirm" ? "Recording" : "Agree, it needs a person", run: confirm };

  return (
    <div className="shrink-0 border-t border-hairline">
      <ActionStrip armed={armed} onClose={() => setArmed(null)} actions={actions} review={review} actor={actor} onName={onName} />

      <div className="flex min-h-[60px] flex-wrap items-center gap-2 px-6 py-3">
        <Button variant="primary" disabled={!open || busy} onClick={lead.run}>
          {lead.label}
        </Button>
        <span className="min-w-0 grow truncate text-caption text-ink-tertiary">{open ? SAYS[lead.key] : "This case is settled."}</span>

        {!failure && lead.key !== "confirm" ? (
          <Button variant="secondary" disabled={!open || busy} onClick={confirm}>
            {actions.pending === "confirm" ? "Recording" : "Agree, it needs a person"}
          </Button>
        ) : null}

        <Button variant="quiet" aria-expanded={more} onClick={() => setMore((was) => !was)}>
          {more ? "Fewer" : "More"}
        </Button>
      </div>

      {more ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline-faint px-6 py-2.5">
          {!failure && onCorrect && lead.key !== "correct" ? (
            <Button variant="quiet" disabled={!open || busy} onClick={guarded(onCorrect)}>
              Say what a document reads
            </Button>
          ) : null}
          {!failure && review.reason && UPLOADABLE.includes(review.reason) && lead.key !== "upload" ? (
            <Button variant="quiet" disabled={!open || busy} onClick={guarded(arm("upload"))}>
              Upload a readable copy
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
