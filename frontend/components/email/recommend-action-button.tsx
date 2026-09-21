"use client";

import { useDock } from "@/components/dock/dock-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

/**
 * The step after the finding. A mismatch on a draft bill of lading has an
 * answer a documentation clerk would reach for, and the check used to stop at
 * naming the field.
 *
 * It puts the question to the dock rather than deciding anything here: what to
 * do turns on how often this sender has differed and on whether the quotes
 * were found, which is a read of the model and not a rule that could live in a
 * button. The email is already attached, so the answer is about this one.
 *
 * `Button variant="primary"`, the same 34px control `ActionBar` leads with:
 * this is the one thing to do about a mismatch, so it reads as one and not as
 * a chip beside an export link.
 */
export function RecommendActionButton({ emailId, differing }: { emailId: string; differing: string[] }) {
  const dock = useDock();
  const fields = differing.join(", ");
  return (
    <Button
      variant="primary"
      onClick={() =>
        dock.ask(
          `The documents on ${emailId} disagree on ${fields}. What should I do about it, and draft the reply to the sender.`,
          ["recommend-action"],
        )
      }
      title="Ask Retina what to do about this, with a draft reply"
    >
      <Icon name="chat" size={13} />
      Recommend action
    </Button>
  );
}
