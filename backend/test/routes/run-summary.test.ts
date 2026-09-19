import { describe, expect, it } from "vitest";

import type { RunStatus } from "../../src/contracts";
import type { Run } from "../../src/ontology/repositories";
import { toSummary } from "../../src/routes/run-summary";

function run(status: RunStatus, totalEmails: number | null, startedAt: string | null = null): Run {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    source: "averis",
    ratePerSecond: 0,
    emailLimit: null,
    emailIds: null,
    status,
    totalEmails,
    ingestEpoch: 0,
    promptSet: {},
    createdBy: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    startedAt,
    finishedAt: null,
  };
}

const counts = (done: number, failed: number, classifying = 0, inReview = 0) => ({
  ingested: 0,
  classifying,
  classified: 0,
  comparing: 0,
  review: inReview,
  done,
  failed,
});
const usage = { calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, verifierShare: 0 };
const review = { open: 0, byReason: { wrong_doc_type: 0, missing_attachment: 0, unreadable: 0, missing_value: 0 } };
const outcomes = {
  ok: 0,
  mismatch: 0,
  byField: { shipper: 0, consignee: 0, notify_party: 0, port_of_loading: 0, port_of_discharge: 0, container_count: 0, gross_weight_kg: 0 },
};

describe("toSummary: when a run is finished", () => {
  it.each([
    ["every email done", "completed", 3, counts(3, 0), 3, true],
    ["done and failed together make up the run", "completed", 3, counts(2, 1), 3, true],
    ["an email waiting for a person is finished as far as the run goes", "completed", 3, counts(1, 1, 0, 1), 3, true],
    ["one email still classifying", "completed", 3, counts(2, 0, 1), 2, false],
    ["still ingesting: the size is not known yet", "running", null, counts(2, 0), 2, false],
    ["cancelled with emails left where they stopped", "cancelled", 3, counts(1, 0, 1), 1, true],
    ["failed before ingesting everything", "failed", null, counts(0, 0), 0, true],
  ] as const)("%s", (_name, status, total, stageCounts, finishedEmails, processingDone) => {
    const summary = toSummary(run(status, total), { stageCounts, queues: null, llm: usage, review, outcomes, lastSubmission: undefined, lastFinishedAt: null, now: 0 });
    expect(summary).toMatchObject({ finishedEmails, processingDone });
  });
});

describe("toSummary: how long the run took", () => {
  const parts = (lastFinishedAt: string | null, now: number) => ({
    stageCounts: counts(3, 0),
    queues: null,
    llm: usage,
    review,
    outcomes,
    lastSubmission: undefined,
    lastFinishedAt,
    now,
  });
  const start = "2026-09-20T10:00:00.000Z";

  it("is start to the last email finishing once the run is done, however long ago that was", () => {
    const summary = toSummary(run("completed", 3, start), parts("2026-09-20T10:01:30.000Z", Date.parse("2026-09-21T00:00:00Z")));
    expect(summary.elapsedMs).toBe(90_000);
  });

  it("is start to now while emails are still being worked on", () => {
    const working = { ...parts(null, Date.parse("2026-09-20T10:00:45.000Z")), stageCounts: counts(1, 0, 2) };
    expect(toSummary(run("completed", 3, start), working).elapsedMs).toBe(45_000);
  });

  it("is null before the run starts", () => {
    expect(toSummary(run("created", null), parts(null, 1)).elapsedMs).toBeNull();
  });
});
