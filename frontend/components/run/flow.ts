import type { RunSummary } from "@/lib/api/runs-schemas";

import { outcomeBreakdown, type SliceTone } from "./outcomes";

/**
 * The run as one journey: what arrived, which half of it needed a document
 * check, and where each half ended.
 *
 * This replaced a strip of six stage cards and a ring. Between them they said
 * how many emails were at each step and what share each outcome took, and
 * neither said the thing a person actually asks first, which is how the one
 * number at the top became the several numbers at the bottom. A flow says it
 * in one picture: the 300 that needed no check are a band that leaves at the
 * first split and never reaches the second queue, and the 91 with no draft yet
 * are a band that crosses and ends without ever being compared.
 *
 * Three columns and nothing more. The five categories `classify` decides
 * between would be the better middle column, and the backend does not count
 * them yet; `needs a check` against `no check needed` is the same split at the
 * grain that is actually stored, and it is the split that explains the rest of
 * the picture.
 *
 * Pure: a run in, nodes and links out. Nothing here decides a verdict, and no
 * label changes what is stored or submitted.
 */

export interface FlowNode {
  id: string;
  label: string;
  count: number;
  tone: SliceTone;
  /** The column it sits in, left to right. */
  depth: 0 | 1 | 2;
  /**
   * Where it sits in its column, top to bottom.
   *
   * Stated rather than left to the layout. Given a free hand the library put
   * `No check needed` in the middle of the last column and `Needs a person` at
   * the foot of it, which made the one band a reader has to act on the longest
   * and faintest thing on the page: twenty emails swooping under three hundred
   * to reach the bottom corner. The four outcomes of a check now sit together
   * under the queue they came from, and the band that never entered that queue
   * runs flat along the bottom without crossing anything.
   */
  order: number;
  /** What it means, for the tooltip. Empty where the label already says it. */
  says: string;
}

export interface FlowLink {
  from: string;
  to: string;
  count: number;
  /** A link takes the tone of where it ends: what matters is where an email got to. */
  tone: SliceTone;
}

export interface RunFlow {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Every email the run has landed. The first node's count and the whole of the picture. */
  total: number;
}

/** The outcomes that only a compared pair can reach, in the order the eye should meet them. */
const AFTER_CHECK = ["awaiting_draft", "OK", "MISMATCH"];

/**
 * `notComparable` and `awaitingDraft` are facts about the queues rather than
 * about a comparison, which is why they arrive beside the run instead of on
 * it. `outcomes.ts` already folds them into one set of slices over one
 * denominator, so this reads its result rather than counting a second time and
 * risking a picture that disagrees with the legend beside it.
 */
export function runFlow(run: Pick<RunSummary, "outcomes" | "review">, notComparable: number, awaitingDraft: number): RunFlow {
  const { slices, total } = outcomeBreakdown(run, notComparable, awaitingDraft);
  const ends = slices.filter((slice) => slice.count > 0);

  // Everything that is not `no check needed` crossed into the second queue,
  // counted from the slices so the two halves cannot add up to anything but
  // the whole.
  const crossed = ends.filter((slice) => slice.key !== "not_comparable");
  const needCheck = crossed.reduce((sum, slice) => sum + slice.count, 0);

  const nodes: FlowNode[] = [
    { id: "arriving", label: "Arriving", count: total, tone: "muted", depth: 0, order: 0, says: "Every email this run was given." },
  ];
  const links: FlowLink[] = [];

  if (needCheck > 0) {
    nodes.push({
      id: "needs-check",
      label: "Needs a check",
      count: needCheck,
      tone: "muted",
      depth: 1,
      order: 0,
      says: "Sorted into a category that asks for the two documents to be compared.",
    });
    links.push({ from: "arriving", to: "needs-check", count: needCheck, tone: "muted" });
  }

  // The parked reasons are one node here and four on the drill-down. Four
  // links of five emails each would be hairlines nobody can point at, and they
  // would cross everything else to reach the foot of the column.
  const parked = ends.filter((slice) => slice.group === "parked");
  const parkedCount = parked.reduce((sum, slice) => sum + slice.count, 0);

  AFTER_CHECK.forEach((key, at) => {
    const slice = ends.find((one) => one.key === key);
    if (!slice) return;
    nodes.push({ id: slice.key, label: slice.label, count: slice.count, tone: slice.tone, depth: 2, order: at, says: slice.says });
    links.push({ from: "needs-check", to: slice.key, count: slice.count, tone: slice.tone });
  });

  if (parkedCount > 0) {
    nodes.push({
      id: "needs-person",
      label: "Needs a person",
      count: parkedCount,
      tone: "review",
      depth: 2,
      // Directly under the three it shares a queue with, and above the band
      // that never entered one.
      order: AFTER_CHECK.length,
      says: "Crossed into the second queue and could not be compared confidently, so it is waiting for a person.",
    });
    links.push({ from: "needs-check", to: "needs-person", count: parkedCount, tone: "review" });
  }

  const noCheck = ends.find((slice) => slice.key === "not_comparable");
  if (noCheck) {
    // Straight from the first node to the last column: it never entered the
    // second queue, and a middle node for it would draw a step it never took.
    nodes.push({ id: noCheck.key, label: noCheck.label, count: noCheck.count, tone: noCheck.tone, depth: 2, order: 99, says: noCheck.says });
    links.push({ from: "arriving", to: noCheck.key, count: noCheck.count, tone: "muted" });
  }

  return { nodes, links, total };
}

/** The four reasons behind `Needs a person`, for the drill-down. Empty when nobody is waiting. */
export function parkedReasons(
  run: Pick<RunSummary, "outcomes" | "review">,
  notComparable: number,
  awaitingDraft: number,
): FlowNode[] {
  return outcomeBreakdown(run, notComparable, awaitingDraft)
    .slices.filter((slice) => slice.group === "parked" && slice.count > 0)
    .map((slice, at) => ({ id: slice.key, label: slice.label, count: slice.count, tone: slice.tone, depth: 2, order: at, says: slice.says }));
}
