import { describe, expect, it } from "vitest";

import type { RunStatus } from "../../src/contracts";
import type { Run } from "../../src/ontology/repositories";
import { toSummary } from "../../src/routes/run-summary";

function run(status: RunStatus, totalEmails: number | null): Run {
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
    startedAt: null,
    finishedAt: null,
  };
}

const counts = (done: number, failed: number, classifying = 0) => ({
  ingested: 0,
  classifying,
  classified: 0,
  comparing: 0,
  review: 0,
  done,
  failed,
});
const usage = { calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, verifierShare: 0 };

describe("toSummary: when a run is finished", () => {
  it.each([
    ["every email done", "completed", 3, counts(3, 0), 3, true],
    ["done and failed together make up the run", "completed", 3, counts(2, 1), 3, true],
    ["one email still classifying", "completed", 3, counts(2, 0, 1), 2, false],
    ["still ingesting: the size is not known yet", "running", null, counts(2, 0), 2, false],
    ["cancelled with emails left where they stopped", "cancelled", 3, counts(1, 0, 1), 1, true],
    ["failed before ingesting everything", "failed", null, counts(0, 0), 0, true],
  ] as const)("%s", (_name, status, total, stageCounts, finishedEmails, processingDone) => {
    const summary = toSummary(run(status, total), { stageCounts, queues: null, llm: usage, lastSubmission: undefined });
    expect(summary).toMatchObject({ finishedEmails, processingDone });
  });
});
