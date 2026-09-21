"use client";

import type { EmailTrace } from "@/lib/api/trace-schemas";

import { AnswerInvoiceButton } from "./answer-invoice-button";
import { groupRows } from "./check-groups";
import { rowsOf } from "./check-tab";
import { DraftShipmentButton } from "./draft-shipment-button";
import { RecommendActionButton } from "./recommend-action-button";

/**
 * What a person can ask about this email. The check places it on the right of
 * the sender's name and address, under the tab row.
 */
export function EmailActions({ trace }: { trace: EmailTrace }) {
  const differing = groupRows(rowsOf(trace)).differing.map((row) => row.judgement.field);
  const category = trace.classification?.humanCategory ?? trace.classification?.finalCategory ?? null;
  const isInvoice = category === "INVOICE_QUERY";
  const canDraft = category === "SI_REQUEST" || category === "BL_COMPARISON" || isInvoice;
  if (!canDraft && differing.length === 0) return null;

  return (
    <>
      {differing.length > 0 ? <RecommendActionButton emailId={trace.emailId} differing={differing} /> : null}
      {isInvoice ? <AnswerInvoiceButton emailId={trace.emailId} /> : null}
      {canDraft && category ? (
        <DraftShipmentButton
          emailId={trace.emailId}
          category={category}
          variant={differing.length > 0 || isInvoice ? "secondary" : "primary"}
        />
      ) : null}
    </>
  );
}
