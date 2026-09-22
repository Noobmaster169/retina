"use client";

import { useDock } from "@/components/dock/dock-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";

import { AnswerInvoiceButton } from "./answer-invoice-button";
import { type EmailActionItem, planEmailActions } from "./email-action-plan";
import { DraftShipmentButton } from "./draft-shipment-button";
import { RecommendActionButton } from "./recommend-action-button";

const BECAUSE: Record<string, string> = {
  missing_value: "a value the check needs is blank",
  unreadable: "a file could not be read",
  missing_attachment: "one of the two documents is not attached",
  wrong_doc_type: "a file is not the document it claims to be",
};

/** What a person can ask about this email, on the right of the sender's name. At most two. */
export function MessageActions({ trace, review }: { trace: EmailTrace; review?: ReviewCaseView | null }) {
  const plan = planEmailActions(trace, review);
  if (plan.length === 0) return null;

  return (
    <>
      {plan.map((action) => (
        <Action key={action.kind} emailId={trace.emailId} action={action} />
      ))}
    </>
  );
}

function Action({ emailId, action }: { emailId: string; action: EmailActionItem }) {
  switch (action.kind) {
    case "recommend":
      return <RecommendActionButton emailId={emailId} differing={action.differing ?? []} />;
    case "answer-invoice":
      return <AnswerInvoiceButton emailId={emailId} variant={action.variant} />;
    case "draft":
      return action.category ? (
        <DraftShipmentButton emailId={emailId} category={action.category} variant={action.variant} />
      ) : null;
    case "ask-sender":
      return <AskSenderButton emailId={emailId} reason={action.reason ?? null} />;
    case "settle-case":
      return <SettleCaseButton emailId={emailId} reason={action.reason ?? null} variant={action.variant} />;
  }
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
