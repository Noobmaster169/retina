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
  /**
   * What that number counts, in words, and null where the number says it
   * already.
   *
   * `0 / 10` does not need `slots busy` after it, and `520` under a card
   * headed `Sorted` does not need `all of them`. The unit survives only where
   * it is news a reader could not get from the number: that a queue is held,
   * that a run is paused, that there is more still to come in.
   */
  unit: string | null;
  pct: number;
  state: CardState;
}

export interface LaneMap {
  cards: StageCard[];
  /** How many of the sorted emails cross into the second queue. Drawn on the arrow between the lanes. */
  crossing: number;
  /** What stopped at the first queue. Not drawn on the strip: the flow below carries it. */
  notComparable: number;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * A paused run is never live, whatever a slot still holds. The last jobs of a
 * pause finish the model call they were in the middle of, and a card that went
 * on sweeping through that was telling a person the button had not worked.
 */
function slots(active: number, concurrency: number, held: boolean, paused: boolean): Pick<StageCard, "value" | "pct" | "state"> {
  if (held) return { value: `0 / ${concurrency}`, pct: 0, state: "held" };
  return {
    value: `${active} / ${concurrency}`,
    pct: pct(active, concurrency),
    state: active > 0 && !paused ? "live" : "idle",
  };
}

export function laneMap(run: RunSummary, queues: RunQueuesView): LaneMap {
  const stages = run.stageCounts;
  const seen = Object.values(stages).reduce((sum, count) => sum + count, 0);
  const left = Math.max(0, (run.totalEmails ?? seen) - seen);
  const sorted = Math.max(0, seen - stages.ingested - stages.classifying);
  const needCheck = queues.handoff.needCheck;
  const awaitingDraft = queues.handoff.awaitingDraft;
  const checked = run.outcomes.ok + run.outcomes.mismatch + run.review.open;
  // Only the emails that had a draft to check can ever be checked. Counting
  // the rest in the denominator read as work the run had skipped: "129 of 220"
  // on a run that was finished, with nothing on the page holding the other 91.
  // A shipping instruction is also awaiting a draft, and it never crossed, so
  // it is not part of that remainder.
  const draftsThatCrossed = Math.max(0, awaitingDraft - queues.handoff.instructionRequests);
  const checkable = Math.max(0, needCheck - draftsThatCrossed);
  const compareHeld = queues.compare.heldUntil !== null;
  const classifyHeld = queues.classify.heldUntil !== null;
  const paused = run.status === "paused";

  return {
    crossing: needCheck,
    notComparable: queues.handoff.notComparable,
    cards: [
      {
        key: "arriving",
        label: "Arriving",
        icon: "inbox",
        value: String(left),
        unit: left === 0 ? null : paused ? "held back" : "to ingest",
        pct: 100,
        state: left === 0 ? "done" : paused ? "idle" : "live",
      },
      {
        key: "classifying",
        label: "Classifying",
        icon: "eye",
        unit: paused ? "paused" : classifyHeld ? "held" : null,
        ...slots(queues.classify.active, queues.classify.concurrency, classifyHeld, paused),
      },
      {
        key: "sorted",
        label: "Sorted",
        icon: "check",
        value: String(sorted),
        unit: run.totalEmails && sorted >= run.totalEmails ? null : `of ${run.totalEmails ?? seen}`,
        pct: pct(sorted, run.totalEmails ?? seen),
        state: "done",
      },
      {
        key: "waiting",
        label: "Waiting",
        icon: "clock",
        value: String(queues.compare.waiting),
        unit: queues.compare.waiting === 0 ? null : "to check",
        pct: pct(queues.compare.waiting, Math.max(needCheck, 1)),
        state: compareHeld && queues.compare.waiting > 0 ? "warn" : "idle",
      },
      {
        key: "checking",
        label: "Checking",
        icon: "scale",
        unit: paused ? "paused" : compareHeld ? "held" : null,
        ...slots(queues.compare.active, queues.compare.concurrency, compareHeld, paused),
      },
      {
        key: "checked",
        label: "Checked",
        icon: "check",
        value: String(checked),
        unit: checkable > 0 && checked >= checkable ? null : `of ${checkable}`,
        pct: pct(checked, Math.max(checkable, 1)),
        state: "done",
      },
    ],
  };
}
