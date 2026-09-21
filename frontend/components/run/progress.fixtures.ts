import type { RunQueuesView, QueueView } from "@/lib/api/queues-schemas";
import type { RunSummary } from "@/lib/api/runs-schemas";

import type { laneMap } from "./progress";

/**
 * The run shapes the lane map is tested against, shared by the files that
 * test it. Here rather than in one of them because the crossing cases and the
 * card cases are two files under the 200-line rule and both need the same run.
 */

export function queue(over: Partial<QueueView> = {}): QueueView {
  return { name: "classify", concurrency: 8, waiting: 0, active: 0, failed: 0, heldUntil: null, slots: [], next: [], ...over };
}

export function queues(over: Partial<RunQueuesView> = {}): RunQueuesView {
  return {
    classify: queue(),
    compare: queue({ name: "compare", concurrency: 4 }),
    handoff: { needCheck: 220, notComparable: 300, awaitingDraft: 0 },
    reachable: true,
    ...over,
  };
}

export function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "044367f9-109f-4766-9c65-df4a30b2bc11",
    name: null,
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

export function card(map: ReturnType<typeof laneMap>, key: string) {
  const found = map.cards.find((c) => c.key === key);
  if (!found) throw new Error(`no ${key} card`);
  return found;
}
