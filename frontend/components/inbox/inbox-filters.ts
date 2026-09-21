import { z } from "zod";

import type { Tone } from "@/components/ui/chip";
import { senderName } from "@/components/email/sender";

import { type InboxRow, needsYou } from "./inbox-rows";

/**
 * Which rows the inbox is showing and in what order. Pure: three passes over
 * an array and nothing else, so the list can be re-narrowed on every keystroke
 * without a request.
 *
 * The filters are questions and not buckets. A row with an open case and two
 * differing fields is an honest answer to both `Needs you` and `Differences`,
 * and a chip count that said otherwise would be counting something other than
 * what its label promises.
 */

export const FilterKey = z.enum(["all", "needs-you", "differences", "agreed", "no-check", "settled", "moving"]);
export type FilterKey = z.infer<typeof FilterKey>;

export const SortKey = z.enum(["id", "attention", "differences", "sender"]);
export type SortKey = z.infer<typeof SortKey>;

export interface InboxView {
  filter: FilterKey;
  sort: SortKey;
  query: string;
}

export const DEFAULT_VIEW: InboxView = { filter: "all", sort: "id", query: "" };

/** The organisers' four, which are also the four values `outcome` takes on a parked email. */
const REVIEW_REASONS = ["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"];

interface FilterDef {
  key: FilterKey;
  label: string;
  tone: Tone;
  /** Drawn even at zero, so the bar keeps its shape as a run fills rather than growing a chip under the cursor. */
  steady: boolean;
  matches: (row: InboxRow) => boolean;
}

export const FILTERS: FilterDef[] = [
  { key: "all", label: "All", tone: "neutral", steady: true, matches: () => true },
  { key: "needs-you", label: "Needs you", tone: "review", steady: true, matches: needsYou },
  { key: "differences", label: "Differences", tone: "differ", steady: true, matches: (row) => row.defects > 0 },
  { key: "agreed", label: "Agreed", tone: "match", steady: true, matches: (row) => row.outcome === "OK" },
  { key: "no-check", label: "No check", tone: "neutral", steady: true, matches: (row) => row.outcome === "not_comparable" },
  {
    // A reason that was raised and answered. Rare, and worth being able to find again.
    key: "settled",
    label: "Settled",
    tone: "neutral",
    steady: false,
    matches: (row) => row.openCase === null && row.outcome !== null && REVIEW_REASONS.includes(row.outcome),
  },
  { key: "moving", label: "Still moving", tone: "signal", steady: false, matches: (row) => row.outcome === null && row.stage !== "failed" },
];

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "id", label: "Email id" },
  { key: "attention", label: "Needs you first" },
  { key: "differences", label: "Most differences" },
  { key: "sender", label: "Sender" },
];

/** Every typed word must appear somewhere in the row. Words and not a phrase: "busan si" finds both. */
export function search(rows: InboxRow[], query: string): InboxRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((row) => words.every((word) => row.haystack.includes(word)));
}

/** How many rows each chip would show. Counted over what the search left, because that is what the chip will do. */
export function countsOf(rows: InboxRow[]): Record<FilterKey, number> {
  const counts = Object.fromEntries(FILTERS.map((filter) => [filter.key, 0])) as Record<FilterKey, number>;
  for (const row of rows) {
    for (const filter of FILTERS) if (filter.matches(row)) counts[filter.key] += 1;
  }
  return counts;
}

/** `email_9` before `email_10`, which a plain string compare gets backwards. */
function byId(a: InboxRow, b: InboxRow): number {
  return a.emailId.localeCompare(b.emailId, undefined, { numeric: true });
}

/** How loudly a row is asking for someone. Lower is louder. */
function urgency(row: InboxRow): number {
  if (needsYou(row)) return 0;
  if (row.defects > 0) return 1;
  if (row.outcome === null) return 2;
  return 3;
}

/** Among two open cases, the one that has been waiting longer. Zero where either is not a case. */
function byAge(a: InboxRow, b: InboxRow): number {
  if (!a.openCase || !b.openCase) return 0;
  return Date.parse(a.openCase.openedAt) - Date.parse(b.openCase.openedAt);
}

const COMPARE: Record<SortKey, (a: InboxRow, b: InboxRow) => number> = {
  id: byId,
  attention: (a, b) => urgency(a) - urgency(b) || byAge(a, b) || byId(a, b),
  differences: (a, b) => b.defects - a.defects || byId(a, b),
  sender: (a, b) => senderName(a.from).localeCompare(senderName(b.from)) || byId(a, b),
};

/** The rows one chip and one ordering leave. `filter` copies, so the sort never touches the caller's array. */
export function narrow(rows: InboxRow[], filter: FilterKey, sort: SortKey): InboxRow[] {
  const def = FILTERS.find((one) => one.key === filter) ?? FILTERS[0];
  return rows.filter(def.matches).sort(COMPARE[sort]);
}
