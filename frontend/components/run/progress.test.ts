import { describe, expect, it } from "vitest";

import { laneMap } from "./progress";
import { card, queue, queues, run } from "./progress.fixtures";

/**
 * The six cards of "How the work moves". What is under test is arrangement,
 * so the cases are the run shapes the design was drawn against: running, a
 * dependency down, paused, finished, and one that has not ingested yet. Where
 * the emails end up is outcomes.test.ts.
 */

describe("laneMap, a run in flight", () => {
  const map = laneMap(run(), queues({ classify: queue({ active: 8 }), compare: queue({ name: "compare", concurrency: 4, active: 4, waiting: 45 }) }));

  it("reads a busy queue as live, against its own concurrency", () => {
    expect(card(map, "classifying")).toMatchObject({ value: "8 / 8", state: "live", unit: null });
    expect(card(map, "checking")).toMatchObject({ value: "4 / 4", state: "live" });
  });

  it("counts everything past the first queue as sorted", () => {
    // 520 seen, less 0 still to ingest and 8 in the model's hands.
    expect(card(map, "sorted").value).toBe("512");
  });

  it("draws the crossing between the lanes, and what stops at the first", () => {
    expect(map.crossing).toBe(220);
    expect(map.notComparable).toBe(300);
  });

  it("measures what has been checked against what needs checking, not against the inbox", () => {
    // 105 OK + 28 MISMATCH + 3 waiting for a person, of the 220 that crossed.
    expect(card(map, "checked")).toMatchObject({ value: "136", unit: "of 220" });
  });
});

describe("laneMap, a dependency down", () => {
  const held = queues({
    classify: queue({ active: 8 }),
    compare: queue({ name: "compare", concurrency: 4, active: 0, waiting: 128, heldUntil: new Date(Date.now() + 21_000).toISOString() }),
  });
  const map = laneMap(run(), held);

  it("says the checking slots are held and not that they failed", () => {
    expect(card(map, "checking")).toMatchObject({ value: "0 / 4", state: "held", unit: "held" });
  });

  it("leaves the first queue alone, because only one of them is held", () => {
    expect(card(map, "classifying").state).toBe("live");
  });

  it("marks the queue piling up behind it", () => {
    expect(card(map, "waiting")).toMatchObject({ value: "128", state: "warn" });
  });

  it("holds the first queue too when that is the one a dependency stopped", () => {
    const map = laneMap(run(), queues({ classify: queue({ active: 0, heldUntil: new Date(Date.now() + 9000).toISOString() }) }));
    expect(card(map, "classifying")).toMatchObject({ state: "held", value: "0 / 8" });
  });
});

describe("laneMap, a finished run", () => {
  const map = laneMap(
    run({
      processingDone: true,
      status: "completed",
      stageCounts: { ingested: 0, classifying: 0, classified: 0, comparing: 0, review: 19, done: 501, failed: 0 },
      outcomes: { ...run().outcomes, ok: 155, mismatch: 46 },
      review: { open: 19, byReason: { wrong_doc_type: 0, missing_attachment: 0, unreadable: 12, missing_value: 7 } },
    }),
    queues(),
  );

  it("says every queue is empty rather than showing an idle slot count as live", () => {
    expect(card(map, "classifying").state).toBe("idle");
    expect(card(map, "checking").state).toBe("idle");
    expect(card(map, "waiting").unit).toBeNull();
  });

  it("says all of them when everything crossed and was checked", () => {
    expect(card(map, "sorted").unit).toBeNull();
    expect(card(map, "checked")).toMatchObject({ value: "220", unit: null });
  });
});

describe("laneMap, before ingest has finished", () => {
  it("counts what is still to arrive", () => {
    const map = laneMap(
      run({ totalEmails: 520, stageCounts: { ingested: 10, classifying: 2, classified: 0, comparing: 0, review: 0, done: 0, failed: 0 } }),
      queues(),
    );
    expect(card(map, "arriving")).toMatchObject({ value: "508", unit: "to ingest", state: "live" });
  });

  it("never reports a negative backlog when the total is not known yet", () => {
    const map = laneMap(run({ totalEmails: null }), queues());
    expect(card(map, "arriving").value).toBe("0");
  });
});

describe("laneMap, a paused run", () => {
  const busy = queues({ classify: queue({ active: 8 }), compare: queue({ name: "compare", concurrency: 4, active: 4, waiting: 45 }) });
  const map = laneMap(run({ status: "paused" }), busy);

  it("lights no card, because a paused run is not working whatever a slot still holds", () => {
    expect(map.cards.every((one) => one.state !== "live")).toBe(true);
  });

  it("says paused where a running card says how many slots are busy", () => {
    expect(card(map, "classifying")).toMatchObject({ value: "8 / 8", state: "idle", unit: "paused" });
    expect(card(map, "checking")).toMatchObject({ value: "4 / 4", state: "idle", unit: "paused" });
  });

  it("holds the arrivals back rather than claiming they are still coming in", () => {
    const partway = laneMap(
      run({ status: "paused", stageCounts: { ingested: 10, classifying: 2, classified: 0, comparing: 0, review: 0, done: 0, failed: 0 } }),
      busy,
    );
    expect(card(partway, "arriving")).toMatchObject({ value: "508", unit: "held back", state: "idle" });
  });

  it("still counts everything a held queue would, because the numbers did not stop being true", () => {
    expect(card(map, "waiting").value).toBe("45");
    expect(map.crossing).toBe(220);
  });
});
