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
    promptSet: run.promptSet,
    llm,
    lastSubmission: last
      ? {
          id: last.id,
          finalScore: last.finalScore,
          nEmails: last.nEmails,
          forced: last.forced,
          createdAt: last.createdAt,
          scores: last.scoreboard
            ? {
                stage1MacroF1: last.scoreboard.stage1.macro_f1,
                stage3DefectF1: last.scoreboard.stage3.defect_f1,
                endToEndRate: last.scoreboard.end_to_end.rate,
                escalationRecall: last.scoreboard.reliability.escalation_recall,
                escalationPrecision: last.scoreboard.reliability.escalation_precision,
              }
            : null,
        }
      : null,
  };
}
