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
 * Nothing here arbitrates. `Correct a field` records what a person says one
 * document reads; it never declares the other one right.
 */

interface ActionBarProps {
  /** Null on an email that needs nobody: the bar is then present and inert, as it was in phase 7. */
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

export function ActionBar({ review, actions, onCorrect, actor, onName }: ActionBarProps) {
  const [armed, setArmed] = useState<Armed>(null);

  if (!review) {
    return (
      <div className="flex h-[60px] shrink-0 items-center gap-2 border-t border-hairline px-6">
        <Button variant="primary" disabled title="This email needs nobody, so there is nothing to record">
          Confirm
        </Button>
        <span className="grow" />
        <span className="text-caption text-ink-tertiary">Nothing here is waiting for a person.</span>
      </div>
    );
  }

  const open = review.status === "open";
  const failure = review.kind === "failure";
  const busy = actions.pending !== null;
  /** A write needs a name on it. Asking at the first write beats a prompt on arrival. */
  const guarded = (run: () => void) => () => (actor ? run() : setArmed("name"));
  const arm = (next: Armed) => () => setArmed(armed === next ? null : next);

  return (
    <div className="shrink-0 border-t border-hairline">
      <ActionStrip armed={armed} onClose={() => setArmed(null)} actions={actions} review={review} actor={actor} onName={onName} />

      <div className="flex h-[60px] items-center gap-2 px-6">
        {failure ? (
          <Button variant="primary" shortcut="R" disabled={!open || busy} onClick={guarded(() => void actions.act({ kind: "retry" }))}>
            {actions.pending === "retry" ? "Sending it back" : "Try it again"}
          </Button>
        ) : (
          <Button variant="primary" shortcut="C" disabled={!open || busy} onClick={guarded(() => void actions.act({ kind: "confirm" }))}>
            {actions.pending === "confirm" ? "Recording" : "Agree, it needs a person"}
          </Button>
        )}

        {!failure && onCorrect ? (
          <Button variant="secondary" shortcut="E" disabled={!open || busy} onClick={guarded(onCorrect)}>
            Correct a field
          </Button>
        ) : null}

        {!failure && review.reason && UPLOADABLE.includes(review.reason) ? (
          <Button variant="secondary" shortcut="U" disabled={!open || busy} onClick={guarded(arm("upload"))}>
            Upload a readable copy
          </Button>
        ) : null}

        {!failure ? (
          <Button variant="secondary" disabled={!open || busy} onClick={guarded(arm("reclassify"))}>
            Reclassify
          </Button>
        ) : null}

        <span className="grow" />

        <Button variant="secondary" shortcut="N" disabled={busy} onClick={guarded(arm("note"))}>
          Note
        </Button>
      </div>
    </div>
  );
}
