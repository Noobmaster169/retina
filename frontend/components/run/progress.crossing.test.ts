import { describe, expect, it } from "vitest";

import { laneMap } from "./progress";
import { card, queues, run } from "./progress.fixtures";

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
    queues({ handoff: { needCheck: 220, notComparable: 300, awaitingDraft: 91 } }),
  );

  it("measures the checked pairs against the pairs that had a draft, not against everything that crossed", () => {
    // 61 agreed + 48 differed + 20 with a person, of the 129 that had a draft.
    expect(card(map, "checked")).toMatchObject({ value: "129", unit: "all of them" });
  });

  it("gives them an end of their own, so the 91 are on the page and not missing from it", () => {
    expect(map.ends.map((end) => [end.label, end.count])).toEqual([
      ["Awaiting a draft", 91],
      ["Documents agree", 61],
      ["Documents differ", 48],
      ["Needs a person", 20],
    ]);
  });

  it("still says how many crossed, because that is what the classify lane handed over", () => {
    expect(map.crossing).toBe(220);
  });

  it("draws no end for them where a run has none", () => {
    expect(laneMap(run(), queues()).ends.map((end) => end.label)).not.toContain("Awaiting a draft");
  });
});
