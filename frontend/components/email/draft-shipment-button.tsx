"use client";

import { useDock } from "@/components/dock/dock-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { Category } from "@/lib/api/trace-schemas";

/**
 * A shipping instruction, a bill of lading check, or an invoice question can be
 * answered with a draft, and the shipment record is what that draft is allowed to
 * rest on.
 *
 * The button decides nothing and writes nothing. It puts the question to the
 * dock with the email already attached and `draft-the-shipment` picked, the
 * same way a mismatch asks for a recommendation. The reply comes back as the
 * draft card.
 */
export function DraftShipmentButton({
  emailId,
  category,
  variant = "primary",
}: {
  emailId: string;
  category: Category;
  /** Secondary when a mismatch already has the primary action beside it. */
  variant?: "primary" | "secondary";
}) {
  const dock = useDock();
  const what =
    category === "SI_REQUEST" ? "shipping instruction" : category === "INVOICE_QUERY" ? "invoice question" : "bill of lading check";
  return (
    <Button
      variant={variant}
      onClick={() =>
        dock.ask(
          `Write the reply email for ${emailId}, a ${what}. Put the message in the draft, from the shipment record: what is on file, and what is still blank. Do not recommend an action.`,
          ["draft-the-shipment"],
        )
      }
      title="Write the reply email from the shipment record"
    >
      <Icon name="mail" size={13} />
      Draft reply
    </Button>
  );
}
