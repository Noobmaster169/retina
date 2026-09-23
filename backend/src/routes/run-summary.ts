import { RunSource, type RunSummary } from "../contracts";
import type { Run, StoredSubmission } from "../ontology/repositories";

export type QueueSnapshot = RunSummary["queues"];

export interface SummaryParts {
  stageCounts: RunSummary["stageCounts"];
  queues: QueueSnapshot;
  llm: RunSummary["llm"];
  review: RunSummary["review"];
  outcomes: RunSummary["outcomes"];
  lastSubmission: StoredSubmission | undefined;
  /** Emails the gate stopped. They have no email_runs row, so no stage count holds them. */
  heldByGate: number;
  /** When the run's last email finished, if one has. */
  lastFinishedAt: string | null;
  now: number;
}

/** One run as the API reports it: its row, where its emails are, what it cost, how it scored. */
export function toSummary(run: Run, parts: SummaryParts): RunSummary {
  const { stageCounts, queues, llm, review, outcomes, heldByGate, lastSubmission: last } = parts;
  // An email at `review` waits for a person, not for the pipeline: the run is finished with it.
  const finishedEmails = stageCounts.done + stageCounts.failed + stageCounts.review;
  const stopped = run.status === "cancelled" || run.status === "failed";
  // A held email is one the run will never hear from again unless a person
  // releases it, and it has no stage to be counted in. Without it here a run
  // that held anything could never read as done and the page would spin.
  const settled = finishedEmails + heldByGate;
  const processingDone = stopped || (run.totalEmails !== null && settled >= run.totalEmails);
  const end = processingDone ? Date.parse(parts.lastFinishedAt ?? run.finishedAt ?? new Date(parts.now).toISOString()) : parts.now;
  return {
    id: run.id,
    name: run.name,
    // A run stored before there was a second inbox names `averis`, so this only
    // falls back for a value nothing writes.
    source: RunSource.catch("averis").parse(run.source),
    status: run.status,
    ratePerSecond: run.ratePerSecond,
    totalEmails: run.totalEmails,
    finishedEmails,
    heldByGate,
    processingDone,
    elapsedMs: run.startedAt ? Math.max(0, end - Date.parse(run.startedAt)) : null,
    stageCounts,
    queues,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    promptSet: run.promptSet,
    llm,
    review,
    outcomes,
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
                weights: {
                  stage1: last.scoreboard.weights.stage1,
                  stage3: last.scoreboard.weights.stage3,
                  endToEnd: last.scoreboard.weights.end_to_end,
                },
              }
            : null,
        }
      : null,
  };
}
