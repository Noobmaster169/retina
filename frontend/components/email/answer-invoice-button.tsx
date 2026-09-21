"use client";

import { useDock } from "@/components/dock/dock-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

/**
 * An invoice question can be answered from the consignment record before anyone
 * drafts a reply. The button puts the question to the dock with the email
 * already attached and `answer-the-invoice` picked, the same way a mismatch
 * asks for a recommendation.
 */
export function AnswerInvoiceButton({
  emailId,
  variant = "primary",
}: {
  emailId: string;
  variant?: "primary" | "secondary";
}) {
  const dock = useDock();
  return (
    <Button
      variant={variant}
      onClick={() =>
        dock.ask(
          `What does the consignment record say about the invoice question on ${emailId}? Answer from shipment facts only. Do not draft a reply.`,
          ["answer-the-invoice"],
        )
      }
      title="Answer from the consignment record"
    >
      <Icon name="graph" size={13} />
      Answer from records
    </Button>
  );
}
