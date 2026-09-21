import type { ReviewCaseItem } from "@/lib/api/review-schemas";
import type { RunEmailItem } from "@/lib/api/trace-schemas";

import { senderName } from "@/components/email/sender";

/**
 * One line of the inbox.
 *
 * An email of a run and the case open against it answer two different
 * questions: the run says how the email came out, and the queue says whether
 * anyone still has to answer for it. The list draws one row, so the two are
 * joined here, once, and nothing below this carries both shapes.
 *
 * `haystack` is built with the row and not inside the search. It is the same
 * string for the life of the row, and rebuilding five hundred of them on every
 * keystroke is the whole difference between a search that feels instant and
 * one that does not.
 */

export interface OpenCase {
  kind: "review" | "failure";
  /** Null exactly when the kind is `failure`: a job that stopped is not one of the organisers' reasons. */
  reason: string | null;
  openedAt: string;
  actions: number;
  lastActionBy: string | null;
}

export interface InboxRow {
  emailId: string;
  from: string;
  subject: string;
  stage: string;
  category: string | null;
  /** How the run ended it: `OK`, `MISMATCH`, `not_comparable`, or a review reason. Null while it is still moving. */
  outcome: string | null;
  /** How many of the seven fields the judge found different. */
  defects: number;
  /** The case still waiting on a person, where there is one. */
  openCase: OpenCase | null;
  /** Every word this row can be found by, lowercased once. */
  haystack: string;
}

export function mergeRows(emails: RunEmailItem[], cases: ReviewCaseItem[]): InboxRow[] {
  const open = new Map(cases.map((one) => [one.emailId, one]));
  return emails.map((email) => {
    const found = open.get(email.emailId);
    const openCase = found
      ? {
          kind: found.kind,
          reason: found.reason,
          openedAt: found.openedAt,
          actions: found.actions,
          lastActionBy: found.lastActionBy,
        }
      : null;
    return {
      emailId: email.emailId,
      from: email.from,
      subject: email.subject,
      stage: email.stage,
      category: email.category,
      outcome: email.outcome,
      defects: email.defectFields.length,
      openCase,
      haystack: haystackOf(email, openCase, senderName(email.from)),
    };
  });
}

/**
 * What a typed word is matched against. The id, the sender both ways, the
 * subject, and every enum the row carries, so `spam`, `unreadable` and
 * `consignee` all find their rows without a filter existing for each.
 */
function haystackOf(email: RunEmailItem, openCase: OpenCase | null, name: string): string {
  return [email.emailId, name, email.from, email.subject, email.category, email.outcome, email.stage, openCase?.reason, ...email.defectFields]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();
}

/** Whether this row is one a person still has to answer for. The one question the rail's count asks. */
export function needsYou(row: InboxRow): boolean {
  return row.openCase !== null || row.stage === "failed";
}
