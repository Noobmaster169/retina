import { describe, expect, it } from "vitest";

import { runFlow } from "./flow";
import { laneMap } from "./progress";
import { card, queues, run } from "./progress.fixtures";

const NO_FIELDS = {
  shipper: 0,
  consignee: 0,
  notify_party: 0,
  port_of_loading: 0,
  port_of_discharge: 0,
  container_count: 0,
  gross_weight_kg: 0,
};
const REVIEW = { open: 20, byReason: { wrong_doc_type: 5, missing_attachment: 5, unreadable: 5, missing_value: 5 } };

/**
 * The organisers' own class: a comparison request whose draft has not been
 * sent yet. It crosses into the second queue and ends there with no pair, so
 * it can never be checked and must not be counted as work still to do. The
 * numbers are a real finished run of the shipped inbox.
 */
describe("laneMap, a run holding comparison requests with no draft yet", () => {
  const map = laneMap(
    run({
      processingDone: true,
      status: "completed",
      stageCounts: { ingested: 0, classifying: 0, classified: 0, comparing: 0, review: 20, done: 500, failed: 0 },
      outcomes: { ...run().outcomes, ok: 61, mismatch: 48 },
      review: { open: 20, byReason: { wrong_doc_type: 5, missing_attachment: 5, unreadable: 5, missing_value: 5 } },
    }),
    queues({ handoff: { needCheck: 220, notComparable: 300, awaitingDraft: 91, instructionRequests: 0 } }),
  );

  it("measures the checked pairs against the pairs that had a draft, not against everything that crossed", () => {
    // 61 agreed + 48 differed + 20 with a person, of the 129 that had a draft.
    expect(card(map, "checked")).toMatchObject({ value: "129", unit: null });
  });

  it("still says how many crossed, because that is what the classify lane handed over", () => {
    expect(map.crossing).toBe(220);
  });

  /**
   * The strip used to end in a row of chips naming the five outcomes, and two
   * tests here held them to it so the 91 could not go missing again. The chips
   * went when the flow diagram below started naming the same five and opening
   * each one's emails, so the guarantee is asserted against the flow instead
   * of dropped: it is the same fact, drawn somewhere better.
   */
  it("leaves the 91 an ending of their own, wherever the page draws it", () => {
    const flow = runFlow(
      { outcomes: { ok: 61, mismatch: 48, byField: NO_FIELDS }, review: REVIEW },
      300,
      91,
    );
    expect(flow.nodes.find((node) => node.id === "awaiting_draft")).toMatchObject({ count: 91, label: "Needs a draft" });
    expect(flow.nodes.find((node) => node.id === "awaiting_draft")?.filter).toBe("awaiting-draft");
  });

  it("draws nothing for them where a run has none", () => {
    const flow = runFlow({ outcomes: { ok: 0, mismatch: 0, byField: NO_FIELDS }, review: REVIEW }, 40, 0);
    expect(flow.nodes.map((node) => node.id)).not.toContain("awaiting_draft");
  });
});
