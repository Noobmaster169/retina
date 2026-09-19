import type { RunSummary } from "../contracts";
import type { Run, StoredSubmission } from "../ontology/repositories";

export type QueueSnapshot = RunSummary["queues"];

export interface SummaryParts {
  stageCounts: RunSummary["stageCounts"];
  queues: QueueSnapshot;
  llm: RunSummary["llm"];
  lastSubmission: StoredSubmission | undefined;
}

/** One run as the API reports it: its row, where its emails are, what it cost, how it scored. */
export function toSummary(run: Run, parts: SummaryParts): RunSummary {
  const { stageCounts, queues, llm, lastSubmission: last } = parts;
  return {
    id: run.id,
    status: run.status,
    ratePerSecond: run.ratePerSecond,
    totalEmails: run.totalEmails,
    stageCounts,
    queues,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    llm,
    lastSubmission: last
      ? { id: last.id, finalScore: last.finalScore, nEmails: last.nEmails, forced: last.forced, createdAt: last.createdAt }
      : null,
  };
}
