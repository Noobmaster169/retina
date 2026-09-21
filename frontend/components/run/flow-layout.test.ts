import { describe, expect, it } from "vitest";

import { runFlow } from "./flow";
import { labelSpot, layoutFlow } from "./flow-layout";

/**
 * Labels colliding is geometry, not taste, so it is checked rather than
 * looked at. Every case here is a real run shape that put two of them on top
 * of each other or on top of a band.
 */

const NO_FIELDS = {
  shipper: 0,
  consignee: 0,
  notify_party: 0,
  port_of_loading: 0,
  port_of_discharge: 0,
  container_count: 0,
  gross_weight_kg: 0,
};

function counts(ok: number, mismatch: number, reasons: Partial<Record<string, number>> = {}) {
  const byReason = { wrong_doc_type: 0, missing_attachment: 0, unreadable: 0, missing_value: 0, ...reasons };
  return {
    outcomes: { ok, mismatch, byField: NO_FIELDS },
    review: { open: Object.values(byReason).reduce((sum, n) => sum + n, 0), byReason },
  };
}

/** One line of label, so two centres closer than this touch. */
const LINE = 13;

const RUNS: { name: string; flow: ReturnType<typeof runFlow> }[] = [
  { name: "the finished 520", flow: runFlow(counts(61, 48, { wrong_doc_type: 5, missing_attachment: 5, unreadable: 5, missing_value: 5 }), 300, 91) },
  // The live run that showed the bug: three outcomes holding one or two
  // emails each, so their nodes are a pixel tall and sit as close as the
  // padding allows.
  { name: "a part-run where three outcomes hold almost nothing", flow: runFlow(counts(1, 1, { wrong_doc_type: 1, unreadable: 1 }), 60, 8) },
  { name: "a run with a single outcome", flow: runFlow(counts(4, 0), 10, 0) },
  { name: "a run where nothing needed a check", flow: runFlow(counts(0, 0), 40, 0) },
];

describe("no two labels of one column touch", () => {
  for (const { name, flow } of RUNS) {
    it(name, () => {
      const { nodes } = layoutFlow(flow);
      const byColumn = new Map<number, number[]>();
      for (const node of nodes) {
        const spot = labelSpot(node);
        byColumn.set(node.column, [...(byColumn.get(node.column) ?? []), spot.y]);
      }
      for (const [column, ys] of byColumn) {
        const sorted = [...ys].sort((a, b) => a - b);
        for (let at = 1; at < sorted.length; at++) {
          expect(sorted[at] - sorted[at - 1], `column ${column} has two labels ${sorted[at] - sorted[at - 1]}px apart`).toBeGreaterThanOrEqual(LINE);
        }
      }
    });
  }
});

describe("no label is drawn over a band", () => {
  it("the middle column's label goes above it, because both its sides are bands", () => {
    const { nodes } = layoutFlow(RUNS[0].flow);
    const middle = nodes.find((node) => node.column === 1);
    expect(middle).toBeDefined();
    expect(labelSpot(middle!).anchor).toBe("middle");
    expect(labelSpot(middle!).y).toBeLessThan(middle!.y0);
  });

  it("an ending that never entered the second queue is still labelled on the right", () => {
    const { nodes } = layoutFlow(RUNS[0].flow);
    const noCheck = nodes.find((node) => node.id === "not_comparable");
    // d3 gives this one `depth` 1 while placing it in the last column, which
    // is the trap the whole `last` field exists to avoid.
    expect(noCheck?.last).toBe(true);
    expect(labelSpot(noCheck!).anchor).toBe("start");
    expect(labelSpot(noCheck!).x).toBeGreaterThan(noCheck!.x1);
  });

  it("stays inside the drawing, top and bottom", () => {
    for (const { flow } of RUNS) {
      for (const node of layoutFlow(flow).nodes) expect(labelSpot(node).y).toBeGreaterThan(0);
    }
  });
});
