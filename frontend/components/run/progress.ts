import { RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";
import type { IconName } from "@/components/ui/icons";
import type { FilterKey } from "@/components/inbox/inbox-filters";

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
  /** What stopped at the first queue, drawn on a drop rule under `Sorted`. */
  notComparable: number;
  /**
   * Where the checked pairs came out, drawn on a drop rule under `Checked`.
   * Each carries the inbox filter that shows exactly what it counted, so the
   * number and the list a click opens can never mean two different things.
   *
   * Named in plain English like the outcomes panel beside it: one screen, one
   * vocabulary. outcomes.ts says why, and why the enum is not lost.
   */
  ends: { label: string; count: number; tone: "match" | "differ" | "review" | "fault"; filter: FilterKey }[];
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
  const checked = run.outcomes.ok + run.outcomes.mismatch + run.review.open;
  const compareHeld = queues.compare.heldUntil !== null;
  const classifyHeld = queues.classify.heldUntil !== null;
  const paused = run.status === "paused";

  return {
    crossing: needCheck,
    notComparable: queues.handoff.notComparable,
    ends: [
      { label: "Documents agree", count: run.outcomes.ok, tone: "match", filter: "agreed" },
      { label: "Documents differ", count: run.outcomes.mismatch, tone: "differ", filter: "differences" },
      ...(run.stageCounts.failed > 0
        ? ([{ label: "Stopped", count: run.stageCounts.failed, tone: "fault", filter: "failed" }] as const)
        : ([{ label: "Needs a person", count: run.review.open, tone: "review", filter: "needs-you" }] as const)),
    ],
    cards: [
      {
        key: "arriving",
        label: "Arriving",
        icon: "inbox",
        value: String(left),
        unit: left === 0 ? "all in" : paused ? "held back" : "to ingest",
        pct: 100,
        state: left === 0 ? "done" : paused ? "idle" : "live",
      },
      {
        key: "classifying",
        label: "Classifying",
        icon: "eye",
        unit: paused ? "paused" : classifyHeld ? "held" : "slots busy",
        ...slots(queues.classify.active, queues.classify.concurrency, classifyHeld, paused),
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
        unit: queues.compare.waiting === 0 ? "none queued" : "to check",
        pct: pct(queues.compare.waiting, Math.max(needCheck, 1)),
        state: compareHeld && queues.compare.waiting > 0 ? "warn" : "idle",
      },
      {
        key: "checking",
        label: "Checking",
        icon: "scale",
        unit: paused ? "paused" : compareHeld ? "held" : "pairs open",
        ...slots(queues.compare.active, queues.compare.concurrency, compareHeld, paused),
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
