import { RunSummary } from "@/lib/api/runs-schemas";

/**
 * Where a run's emails ended up, as one set of slices over one denominator.
 *
 * The list this replaced drew two groups against two different denominators:
 * `not_comparable` was a full bar because it was measured against itself, and
 * every parked reason was measured against the parked total. Two bars of the
 * same length meant two different things, which a list can get away with and a
 * pie cannot. Everything here is a share of every email that has landed.
 *
 * Every slice carries both names it has. `key` is the organisers' enum, which
 * is what the scorer speaks and what the tooltip shows; `label` is what a
 * person who has not read the brief would call the same thing, which is what
 * the panel shows. `not_comparable` and `wrong_doc_type` are precise and they
 * are not English, and this panel is the one screen a business owner reads
 * before anything else. Nothing is translated in the working screens: see
 * docs/05-design.md principle 4.
 *
 * Pure arrangement. No threshold or verdict is decided here, and no label
 * changes what is stored or submitted.
 */

export type SliceTone = "match" | "differ" | "review" | "fault" | "muted";

export interface OutcomeSlice {
  /** The organisers' own word for this outcome, as the scorer and the tooltip say it. */
  key: string;
  /** The same outcome in plain English, which is what the panel shows. */
  label: string;
  count: number;
  /** Share of every landed email, 0 to 100. */
  pct: number;
  tone: SliceTone;
  /** Which half of the run it belongs to: finished by the pipeline, or parked for a person. */
  group: "finished" | "parked";
  /** What this outcome means, for the tooltip. The enum name is not self-explanatory to a reader. */
  says: string;
}

export interface OutcomeBreakdown {
  slices: OutcomeSlice[];
  /** Every email counted here. The pie's whole, and the denominator of every share. */
  total: number;
  /** Of them, the ones waiting for a person. */
  parked: number;
}

/** What each outcome is called on screen, and what it means. Both trace to the organisers' definitions. */
const WORDS: Record<string, { label: string; says: string }> = {
  not_comparable: { label: "No check needed", says: "Sorted into a category that asks for no document check." },
  OK: { label: "Documents agree", says: "Both documents were read and every compared field agreed." },
  MISMATCH: { label: "Documents differ", says: "Both documents were read and at least one field differed." },
  wrong_doc_type: { label: "Wrong document", says: "An attachment was not the document the email asked about." },
  missing_attachment: { label: "Document missing", says: "A document the comparison needs was not attached." },
  unreadable: { label: "Could not be read", says: "A file could not be read, so nothing could be compared." },
  missing_value: { label: "Detail missing", says: "A field the comparison needs was absent from a document." },
};

const TONES: Record<string, SliceTone> = { not_comparable: "muted", OK: "match", MISMATCH: "differ" };

/**
 * `notComparable` comes from the handoff rather than from the summary: it
 * counts the emails that never crossed into the second queue, which is a fact
 * about the queues and not about a comparison that happened.
 */
export function outcomeBreakdown(run: Pick<RunSummary, "outcomes" | "review">, notComparable: number): OutcomeBreakdown {
  const finished: [string, number][] = [
    ["not_comparable", notComparable],
    ["OK", run.outcomes.ok],
    ["MISMATCH", run.outcomes.mismatch],
  ];
  const parked = Object.entries(run.review.byReason);
  const total = [...finished, ...parked].reduce((sum, [, count]) => sum + count, 0);
  const share = (count: number) => (total > 0 ? (count / total) * 100 : 0);

  return {
    total,
    parked: parked.reduce((sum, [, count]) => sum + count, 0),
    slices: [
      ...finished.map(([key, count]) => slice(key, count, share(count), "finished")),
      ...parked.map(([key, count]) => slice(key, count, share(count), "parked")),
    ],
  };
}

function slice(key: string, count: number, pct: number, group: OutcomeSlice["group"]): OutcomeSlice {
  const words = WORDS[key];
  return { key, label: words?.label ?? key, count, pct, tone: TONES[key] ?? "review", group, says: words?.says ?? "" };
}
