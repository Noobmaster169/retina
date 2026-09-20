import { describe, expect, it } from "vitest";

import type { RunQueuesView, QueueView } from "@/lib/api/queues-schemas";
import type { RunSummary } from "@/lib/api/runs-schemas";

import { laneMap, outcomeRows } from "./progress";

/**
 * The six cards of "How the work moves" and the outcomes list. What is under
 * test is arrangement, so the cases are the four run shapes the design was
 * drawn against: running, a dependency down, finished, and a run that has not
 * ingested yet.
 */

function queue(over: Partial<QueueView> = {}): QueueView {
  return { name: "classify", concurrency: 8, waiting: 0, active: 0, failed: 0, heldUntil: null, slots: [], next: [], ...over };
}

function queues(over: Partial<RunQueuesView> = {}): RunQueuesView {
  return {
    classify: queue(),
    compare: queue({ name: "compare", concurrency: 4 }),
    handoff: { needCheck: 220, notComparable: 300 },
    reachable: true,
    ...over,
  };
}

function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "044367f9-109f-4766-9c65-df4a30b2bc11",
    status: "running",
    ratePerSecond: 2,
    totalEmails: 520,
    finishedEmails: 436,
    processingDone: false,
    elapsedMs: 252_000,
    stageCounts: { ingested: 0, classifying: 8, classified: 45, comparing: 4, review: 3, done: 460, failed: 0 },
    queues: null,
    createdAt: "2026-09-20T14:00:00.000Z",
    startedAt: "2026-09-20T14:00:00.000Z",
    finishedAt: null,
    promptSet: {},
    llm: { calls: 595, failedCalls: 0, inputTokens: 1, outputTokens: 1, costUsd: 1, verifierShare: 0.08 },
    review: { open: 3, byReason: { wrong_doc_type: 0, missing_attachment: 0, unreadable: 2, missing_value: 1 } },
    outcomes: {
      ok: 105,
      mismatch: 28,
      byField: { shipper: 0, consignee: 12, notify_party: 9, port_of_loading: 0, port_of_discharge: 0, container_count: 0, gross_weight_kg: 7 },
    },
    lastSubmission: null,
    ...over,
  };
}

function card(map: ReturnType<typeof laneMap>, key: string) {
  const found = map.cards.find((c) => c.key === key);
  if (!found) throw new Error(`no ${key} card`);
  return found;
}

describe("laneMap, a run in flight", () => {
  const map = laneMap(run(), queues({ classify: queue({ active: 8 }), compare: queue({ name: "compare", concurrency: 4, active: 4, waiting: 45 }) }));

  it("reads a busy queue as live, against its own concurrency", () => {
    expect(card(map, "classifying")).toMatchObject({ value: "8 / 8", state: "live", unit: "slots busy" });
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
    expect(card(map, "waiting").unit).toBe("none queued");
  });

  it("says all of them when everything crossed and was checked", () => {
    expect(card(map, "sorted").unit).toBe("all of them");
    expect(card(map, "checked")).toMatchObject({ value: "220", unit: "all of them" });
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

describe("outcomeRows", () => {
  const rows = outcomeRows(run(), 300);

  it("keeps the organisers' enums verbatim, never prettified", () => {
    expect(rows.finished.map((row) => row.key)).toEqual(["not_comparable", "OK", "MISMATCH"]);
    expect(rows.parked.map((row) => row.key)).toEqual(["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]);
  });

  it("gives every parked reason a violet, because each is an uncertainty and not a fault", () => {
    expect(rows.parked.every((row) => row.tone === "review")).toBe(true);
  });

  it("keeps a difference and an uncertainty in different hues", () => {
    const mismatch = rows.finished.find((row) => row.key === "MISMATCH");
    expect(mismatch?.tone).toBe("differ");
    expect(rows.parked.some((row) => row.tone === "differ")).toBe(false);
  });

  it("takes a share of what was compared, not of the whole inbox", () => {
    const ok = rows.finished.find((row) => row.key === "OK");
    expect(ok?.pct).toBeCloseTo((105 / 133) * 100, 5);
  });

  it("does not divide by zero before anything has been compared", () => {
    const empty = outcomeRows(run({ outcomes: { ...run().outcomes, ok: 0, mismatch: 0 }, review: { open: 0, byReason: { wrong_doc_type: 0, missing_attachment: 0, unreadable: 0, missing_value: 0 } } }), 0);
    expect(empty.finished.every((row) => Number.isFinite(row.pct))).toBe(true);
    expect(empty.parked.every((row) => Number.isFinite(row.pct))).toBe(true);
  });
});
