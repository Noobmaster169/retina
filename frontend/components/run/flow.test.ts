import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/lib/api/runs-schemas";

import { parkedReasons, runFlow } from "./flow";

/**
 * The picture has to add up, because a reader adds it up. Every case here is
 * about a band arriving somewhere: what leaves `Arriving` is what reaches the
 * last column, and what enters the second queue is what leaves it.
 */

type Counts = Pick<RunSummary, "outcomes" | "review">;

const NO_FIELDS = {
  shipper: 0,
  consignee: 0,
  notify_party: 0,
  port_of_loading: 0,
  port_of_discharge: 0,
  container_count: 0,
  gross_weight_kg: 0,
};

function counts(ok: number, mismatch: number, byReason: Partial<Counts["review"]["byReason"]> = {}): Counts {
  const reasons = { wrong_doc_type: 0, missing_attachment: 0, unreadable: 0, missing_value: 0, ...byReason };
  return {
    outcomes: { ok, mismatch, byField: NO_FIELDS },
    review: { open: Object.values(reasons).reduce((sum, count) => sum + count, 0), byReason: reasons },
  };
}

/** The overnight run of 520 in docs/SDOC_BRIEF.md, which is the shape this was drawn for. */
const OVERNIGHT = counts(61, 48, { wrong_doc_type: 5, missing_attachment: 5, unreadable: 5, missing_value: 5 });

describe("runFlow", () => {
  const flow = runFlow(OVERNIGHT, 300, 91);
  const into = (id: string) => flow.links.filter((link) => link.to === id).reduce((sum, link) => sum + link.count, 0);
  const outOf = (id: string) => flow.links.filter((link) => link.from === id).reduce((sum, link) => sum + link.count, 0);
  const node = (id: string) => flow.nodes.find((one) => one.id === id);

  it("counts every email the run landed", () => {
    expect(flow.total).toBe(520);
    expect(node("arriving")?.count).toBe(520);
  });

  it("everything that arrives leaves again, so no band is drawn out of nothing", () => {
    expect(outOf("arriving")).toBe(520);
  });

  it("splits the arrival into the half that needs a check and the half that does not", () => {
    expect(node("needs-check")?.count).toBe(220);
    expect(node("not_comparable")?.count).toBe(300);
    expect(220 + 300).toBe(flow.total);
  });

  it("everything that crosses into the second queue leaves it", () => {
    expect(into("needs-check")).toBe(220);
    expect(outOf("needs-check")).toBe(220);
  });

  it("the four parked reasons are one band, because four of five would be hairlines", () => {
    expect(node("needs-person")?.count).toBe(20);
    expect(flow.nodes.filter((one) => one.id === "wrong_doc_type")).toEqual([]);
  });

  it("no check needed goes straight to the last column, never through the second queue", () => {
    const link = flow.links.find((one) => one.to === "not_comparable");
    expect(link?.from).toBe("arriving");
    expect(node("not_comparable")?.depth).toBe(2);
  });

  it("a band takes the tone of where it ends, since that is what a reader is following", () => {
    expect(flow.links.find((one) => one.to === "OK")?.tone).toBe("match");
    expect(flow.links.find((one) => one.to === "MISMATCH")?.tone).toBe("differ");
    expect(flow.links.find((one) => one.to === "needs-person")?.tone).toBe("review");
  });

  it("draws no node for an outcome nothing reached", () => {
    const clean = runFlow(counts(10, 0), 5, 0);
    expect(clean.nodes.map((one) => one.id)).toEqual(["arriving", "needs-check", "OK", "not_comparable"]);
  });

  it("a run where nothing needed a check draws no second queue at all", () => {
    const none = runFlow(counts(0, 0), 40, 0);
    expect(none.nodes.map((one) => one.id)).toEqual(["arriving", "not_comparable"]);
    expect(none.links).toEqual([{ from: "arriving", to: "not_comparable", count: 40, tone: "muted" }]);
  });

  it("a run that has landed nothing draws one node and no bands", () => {
    const empty = runFlow(counts(0, 0), 0, 0);
    expect(empty.total).toBe(0);
    expect(empty.links).toEqual([]);
  });
});

describe("parkedReasons", () => {
  it("names the four reasons for the drill-down, each with the organisers' own key", () => {
    expect(parkedReasons(OVERNIGHT, 300, 91).map((one) => [one.id, one.count])).toEqual([
      ["wrong_doc_type", 5],
      ["missing_attachment", 5],
      ["unreadable", 5],
      ["missing_value", 5],
    ]);
  });

  it("is empty when nobody is waiting", () => {
    expect(parkedReasons(counts(10, 2), 5, 0)).toEqual([]);
  });
});
