"use client";

import { useDock } from "@/components/dock/dock-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";

import { DraftShipmentButton } from "./draft-shipment-button";

/**
 * What a person can ask about a case, on the right of the sender's name.
 *
 * A file that could not be read, the wrong file, or a missing file is answered
 * by a draft to the sender. A blank value is answered by saying what to do,
 * and a bill can still grow a shipment draft beside that. Nobody uploads a
 * replacement from here.
 */

const BECAUSE: Record<string, string> = {
  missing_value: "a value the check needs is blank",
  unreadable: "a file could not be read",
  missing_attachment: "one of the two documents is not attached",
  wrong_doc_type: "a file is not the document it claims to be",
};

/** Reasons a person used to answer by uploading a file. The reply asks the sender instead. */
const ASKS_SENDER = new Set(["missing_attachment", "unreadable", "wrong_doc_type"]);

export function CaseActions({ trace, review }: { trace: EmailTrace; review: ReviewCaseView }) {
  if (review.kind === "failure" || review.status !== "open") return null;
  const category = trace.classification?.humanCategory ?? trace.classification?.finalCategory ?? null;
  const canDraft = category === "SI_REQUEST" || category === "BL_COMPARISON";
  const asks = review.reason !== null && ASKS_SENDER.has(review.reason);
  return (
    <>
      {asks ? <AskSenderButton emailId={trace.emailId} reason={review.reason} /> : null}
      <SettleCaseButton emailId={trace.emailId} reason={review.reason} variant={asks ? "secondary" : "primary"} />
      {!asks && canDraft && category ? (
        <DraftShipmentButton emailId={trace.emailId} category={category} variant="secondary" />
      ) : null}
    </>
  );
}

function AskSenderButton({ emailId, reason }: { emailId: string; reason: string | null }) {
  const dock = useDock();
  const because = (reason && BECAUSE[reason]) || "a document could not be used";
  return (
    <Button
      variant="primary"
      onClick={() =>
        dock.ask(
          `Write the reply email for ${emailId}. The check stopped because ${because}. Ask the sender for the right document, and say what was wrong with what arrived. Put the message in the draft. Do not recommend an action.`,
          ["ask-for-the-document"],
        )
      }
      title="Draft a reply asking the sender for the right document"
    >
      <Icon name="mail" size={13} />
      Ask the sender
    </Button>
  );
}

function SettleCaseButton({
  emailId,
  reason,
  variant,
}: {
  emailId: string;
  reason: string | null;
  variant: "primary" | "secondary";
}) {
  const dock = useDock();
  const because = (reason && BECAUSE[reason]) || "the check could not be finished";
  return (
    <Button
      variant={variant}
      onClick={() =>
        dock.ask(
          `${emailId} is waiting because ${because}. What should I do? Explain the case and name the next step. Do not draft a reply.`,
          ["settle-the-case"],
        )
      }
      title="Ask Retina what to do about this case"
    >
      <Icon name="chat" size={13} />
      What should I do
    </Button>
  );
}
