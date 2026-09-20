import { RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";
import type { IconName } from "@/components/ui/icons";

/**
 * The six cards of "How the work moves", from numbers the API already
 * returned. This is arrangement, not judgement: nothing here decides a status,
 * applies a threshold or names an outcome, so the frontend rule in CLAUDE.md
 * holds. Every verdict on this page comes from the backend as an enum.
 *
 * The shape is the code's, not a pipeline's: two queues side by side, and only
 * a BL_COMPARISON crossing between them. See queues/names.ts and
 * processors/classify.processor.ts.
 */

export type CardState = "idle" | "live" | "held" | "warn" | "done";

export interface StageCard {
  key: string;
  label: string;
  icon: IconName;
  /** The number as it reads: "8 / 8" for a slot count, "520" for a total. */
  value: string;
  /** What that number counts, in words. */
  unit: string;
  pct: number;
  state: CardState;
}

export interface LaneMap {
  cards: StageCard[];
  /** How many of the sorted emails cross into the second queue. Drawn on the arrow between the lanes. */
  crossing: number;
  notComparable: number;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function slots(active: number, concurrency: number, held: boolean): Pick<StageCard, "value" | "pct" | "state"> {
  if (held) return { value: `0 / ${concurrency}`, pct: 0, state: "held" };
  return {
    value: `${active} / ${concurrency}`,
    pct: pct(active, concurrency),
    state: active > 0 ? "live" : "idle",
  };
}

export function laneMap(run: RunSummary, queues: RunQueuesView): LaneMap {
  const stages = run.stageCounts;
  const seen = Object.values(stages).reduce((sum, count) => sum + count, 0);
  const left = Math.max(0, (run.totalEmails ?? seen) - seen);
  const sorted = Math.max(0, seen - stages.ingested - stages.classifying);
  const needCheck = queues.handoff.needCheck;
  const checked = run.outcomes.ok + run.outcomes.mismatch + run.review.open;
  const compareHeld = queues.compare.heldUntil !== null;
  const classifyHeld = queues.classify.heldUntil !== null;

  return {
    crossing: needCheck,
    notComparable: queues.handoff.notComparable,
    cards: [
      {
        key: "arriving",
        label: "Arriving",
        icon: "inbox",
        value: String(left),
        unit: left === 0 ? "all of them in" : "left to ingest",
        pct: 100,
        state: left === 0 ? "done" : "live",
      },
      {
        key: "reading",
        label: "Reading",
        icon: "eye",
        unit: classifyHeld ? "held, not failed" : "a model each",
        ...slots(queues.classify.active, queues.classify.concurrency, classifyHeld),
      },
      {
        key: "sorted",
        label: "Sorted",
        icon: "check",
        value: String(sorted),
        unit: run.totalEmails && sorted >= run.totalEmails ? "all of them" : `of ${run.totalEmails ?? seen}`,
        pct: pct(sorted, run.totalEmails ?? seen),
        state: "done",
      },
      {
        key: "waiting",
        label: "Waiting",
        icon: "clock",
        value: String(queues.compare.waiting),
        unit: queues.compare.waiting === 0 ? "queue is empty" : "queued to check",
        pct: pct(queues.compare.waiting, Math.max(needCheck, 1)),
        state: compareHeld && queues.compare.waiting > 0 ? "warn" : "idle",
      },
      {
        key: "checking",
        label: "Checking",
        icon: "scale",
        unit: compareHeld ? "held, not failed" : "documents opened",
        ...slots(queues.compare.active, queues.compare.concurrency, compareHeld),
      },
      {
        key: "checked",
        label: "Checked",
        icon: "check",
        value: String(checked),
        unit: needCheck > 0 && checked >= needCheck ? "all of them" : `of ${needCheck}`,
        pct: pct(checked, Math.max(needCheck, 1)),
        state: "done",
      },
    ],
  };
}

/** Where the run's compared pairs ended up, in the organisers' own words and order. */
export interface OutcomeRow {
  key: string;
  count: number;
  pct: number;
  tone: "match" | "differ" | "review" | "fault" | "muted";
  indent?: boolean;
}

export function outcomeRows(run: RunSummary, notComparable: number): { finished: OutcomeRow[]; parked: OutcomeRow[] } {
  const compared = Math.max(run.outcomes.ok + run.outcomes.mismatch, 1);
  const parkedTotal = Math.max(run.review.open, 1);
  return {
    finished: [
      { key: "not_comparable", count: notComparable, pct: 100, tone: "muted" },
      { key: "OK", count: run.outcomes.ok, pct: (run.outcomes.ok / compared) * 100, tone: "match" },
      { key: "MISMATCH", count: run.outcomes.mismatch, pct: (run.outcomes.mismatch / compared) * 100, tone: "differ" },
    ],
    parked: Object.entries(run.review.byReason).map(([key, count]) => ({
      key,
      count,
      pct: (count / parkedTotal) * 100,
      tone: "review" as const,
      indent: true,
    })),
  };
}
