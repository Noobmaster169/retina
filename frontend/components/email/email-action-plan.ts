import type { Category, EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";

import { groupRows } from "./check-groups";
import { rowsOf } from "./check-tab";

/**
 * At most two actions beside the message. Each names one dock skill; nothing
 * here writes to the case or the database.
 */
export type EmailActionKind = "recommend" | "answer-invoice" | "draft" | "ask-sender" | "settle-case";

export interface EmailActionItem {
  kind: EmailActionKind;
  variant: "primary" | "secondary";
  reason?: string | null;
  category?: Category;
  differing?: string[];
}

const ASKS_SENDER = new Set(["missing_attachment", "unreadable", "wrong_doc_type"]);
const CAN_DRAFT = new Set<Category>(["SI_REQUEST", "BL_COMPARISON", "INVOICE_QUERY"]);

function categoryOf(trace: EmailTrace): Category | null {
  return trace.classification?.humanCategory ?? trace.classification?.finalCategory ?? null;
}

function differingFields(trace: EmailTrace): string[] {
  return groupRows(rowsOf(trace)).differing.map((row) => row.judgement.field);
}

function pair(primary: EmailActionItem, secondary?: EmailActionItem): EmailActionItem[] {
  return secondary ? [primary, secondary] : [primary];
}

/** What to draw beside the sender's name. Never more than two controls. */
export function planEmailActions(trace: EmailTrace, review?: ReviewCaseView | null): EmailActionItem[] {
  const category = categoryOf(trace);
  const differing = differingFields(trace);

  if (review) {
    if (review.kind === "failure" || review.status !== "open") return [];
    return planOpenCase(category, differing, review.reason);
  }

  return planCheck(category, differing);
}

function planOpenCase(category: Category | null, differing: string[], reason: string | null): EmailActionItem[] {
  if (reason !== null && ASKS_SENDER.has(reason)) {
    return pair(
      { kind: "ask-sender", variant: "primary", reason },
      { kind: "settle-case", variant: "secondary", reason },
    );
  }

  const draft =
    category && CAN_DRAFT.has(category) ? { kind: "draft" as const, variant: "secondary" as const, category } : null;

  if (differing.length > 0) {
    return pair(
      { kind: "recommend", variant: "primary", differing },
      draft ?? { kind: "settle-case", variant: "secondary", reason },
    );
  }

  return pair({ kind: "settle-case", variant: "primary", reason }, draft ?? undefined);
}

function planCheck(category: Category | null, differing: string[]): EmailActionItem[] {
  if (!category) return [];

  if (category === "SPAM" || category === "GENERAL") {
    if (differing.length === 0) return [];
    return [{ kind: "recommend", variant: "primary", differing }];
  }

  if (category === "INVOICE_QUERY") {
    if (differing.length > 0) {
      return pair(
        { kind: "recommend", variant: "primary", differing },
        { kind: "draft", variant: "secondary", category },
      );
    }
    return pair({ kind: "answer-invoice", variant: "primary" }, { kind: "draft", variant: "secondary", category });
  }

  if (differing.length > 0) {
    return pair(
      { kind: "recommend", variant: "primary", differing },
      { kind: "draft", variant: "secondary", category },
    );
  }

  return [{ kind: "draft", variant: "primary", category }];
}
