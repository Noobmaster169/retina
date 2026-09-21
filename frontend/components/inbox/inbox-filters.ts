import { z } from "zod";

import type { Tone } from "@/components/ui/chip";
import { senderName } from "@/components/email/sender";

import { type InboxRow, needsYou } from "./inbox-rows";

/**
 * Which rows the inbox is showing and in what order. Pure: three passes over
 * an array and nothing else, so the list can be re-narrowed on every keystroke
 * without a request.
 *
 * One email, one chip. The bar used to let a row answer two questions at once,
 * so the same mail sat under two counts and the numbers did not add up to All.
 * A person scanning it wants piles. The first match wins, in the order a clerk
 * would ask: did it stop, does someone have to answer, is it still being read,
 * is it asking for a draft, do the documents disagree, do they agree, was a
 * problem already handled, or is it other mail.
 */

export const FilterKey = z.enum([
  "all",
  "needs-you",
  "differences",
  "agreed",
  "awaiting-draft",
  "no-check",
  "settled",
  "moving",
  "failed",
]);
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

/** Which pile an email belongs in. `all` is the only chip that is not a pile. */
function pile(row: InboxRow): FilterKey {
  if (row.stage === "failed") return "failed";
  if (row.openCase !== null) return "needs-you";
  if (row.outcome === null) return "moving";
  if (row.outcome === "awaiting_draft") return "awaiting-draft";
  if (row.defects > 0 || row.outcome === "MISMATCH") return "differences";
  if (row.outcome === "OK") return "agreed";
  if (REVIEW_REASONS.includes(row.outcome)) return "settled";
  return "no-check";
}

export const FILTERS: FilterDef[] = [
  { key: "all", label: "All", tone: "accent", steady: true, matches: () => true },
  { key: "needs-you", label: "Needs you", tone: "review", steady: true, matches: (row) => pile(row) === "needs-you" },
  { key: "differences", label: "Documents don't match", tone: "differ", steady: true, matches: (row) => pile(row) === "differences" },
  { key: "agreed", label: "Documents match", tone: "match", steady: true, matches: (row) => pile(row) === "agreed" },
  // Asking for a draft to be written: a bill check whose draft was never sent,
  // or a shipping instruction. Its own pile because `Documents match` used to
  // hold the first of those, which said two documents had been read when none had.
  {
    key: "awaiting-draft",
    label: "Needs a draft",
    tone: "signal",
    steady: true,
    matches: (row) => pile(row) === "awaiting-draft",
  },
  { key: "no-check", label: "Other mail", tone: "neutral", steady: true, matches: (row) => pile(row) === "no-check" },
  {
    // A problem that was raised and answered. Rare, and worth being able to find again.
    key: "settled",
    label: "Already handled",
    tone: "neutral",
    steady: false,
    matches: (row) => pile(row) === "settled",
  },
  { key: "moving", label: "Still working", tone: "signal", steady: false, matches: (row) => pile(row) === "moving" },
  // A job that stopped. Not one of the organisers' reasons, and not also
  // `Needs you`: the run page's failed count links here, and a row in both
  // piles would be counted twice.
  { key: "failed", label: "Couldn't finish", tone: "fault", steady: false, matches: (row) => pile(row) === "failed" },
];

/**
 * How loudly a chip is drawn.
 *
 * A bar where every chip is the same grey says nothing about which of them is
 * worth a click; one where every chip is coloured says everything is urgent,
 * which says the same nothing. So three steps, and the count decides which:
 * a chip that is asking for a person carries its hue in its border and its
 * words, a chip that merely holds rows carries it in its words, and a chip
 * holding nothing is grey whatever its tone. `Needs you 0` is not important,
 * and a bar that shouted it anyway would be lying about a quiet run.
 *
 * Pure.
 */
export type Emphasis = "chosen" | "asking" | "holding" | "empty";

/** The tones that mean somebody has to do something about it. */
const ASKING: Tone[] = ["review", "fault"];

export function emphasisOf(tone: Tone, count: number, chosen: boolean): Emphasis {
  if (chosen) return "chosen";
  if (count === 0 || tone === "neutral") return "empty";
  return ASKING.includes(tone) ? "asking" : "holding";
}

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
