"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { RunStatus, RunSummary } from "@/lib/api/runs-schemas";
import { controlsFor, type RunActions } from "@/app/(app)/runs/[id]/use-run-actions";
import { formatDuration } from "@/lib/duration";

import { RunTitle } from "./run-title";

/**
 * The one display line on this page, and the controls beside it.
 *
 * A refusing dependency is not stated here any more. It was a banner first and
 * a chip after, and both were a warning that arrived and left on a thirty
 * second cycle for something that had failed nothing and cost nothing. The
 * queue it stopped says so in its own panel, which is where a person looking
 * for the reason already is, and the status word carries the rest.
 */

interface RunHeaderProps {
  run: RunSummary;
  /** How the two queues read right now, in one sentence under the title. */
  summary: string;
  actions: RunActions;
}

const STATUS_TINT: Record<RunStatus, string> = {
  created: "bg-sunken text-ink-secondary",
  running: "bg-signal-tint text-signal",
  paused: "bg-sunken text-ink-secondary",
  completed: "bg-match-tint text-match",
  cancelled: "bg-sunken text-ink-secondary",
  failed: "bg-fault-tint text-fault",
};

/**
 * What the chip in the top bar says.
 *
 * `status` is the ingest's, not the pipeline's: a run reads `completed` the
 * moment the last email is enqueued, with every queue still full. So the chip
 * says Running until `processingDone`, which is the field that means what a
 * person reading the word would take it to mean.
 *
 * `Degraded` is a reading of the run rather than a status the backend stores.
 */
export function statusWord(run: RunSummary, degraded: boolean): { word: string; tint: string } {
  const working = !run.processingDone && (run.status === "running" || run.status === "completed");
  if (degraded && working) return { word: "Degraded", tint: "bg-fault-tint text-fault" };
  if (working) return { word: "Running", tint: STATUS_TINT.running };
  const word = run.status.charAt(0).toUpperCase() + run.status.slice(1);
  return { word, tint: STATUS_TINT[run.status] };
}

export function RunHeader({ run, summary, actions }: RunHeaderProps) {
  const router = useRouter();
  const done = run.processingDone;
  const controls = controlsFor(run);

  /** The scorer's answer is a page, so taking it lands there. A refusal stays here and says why. */
  async function score(force: boolean) {
    if (await actions.submit(force)) router.push(`/runs/${run.id}/results`);
  }

  return (
    <>
      <div className="flex h-[88px] shrink-0 items-center gap-4 px-6">
        <div className="min-w-0">
          <RunTitle run={run} onRename={actions.rename} />
          <p className="mt-0.5 pl-0.5 text-body text-ink-tertiary">
            {run.totalEmails === null ? "Counting the inbox" : `${run.totalEmails} emails`}
            {run.ratePerSecond === 0 ? " all at once" : ` at ${run.ratePerSecond} a second`}
            {run.elapsedMs === null ? ", not started yet. " : `, ${formatDuration(run.elapsedMs)}${done ? " in total. " : " in. "}`}
            {summary}
          </p>
        </div>
        <span className="grow" />
        {controls.map((action) => (
          <Button
            key={action}
            variant="secondary"
            disabled={actions.pending !== null}
            onClick={() => void actions.control(action)}
            className="capitalize"
          >
            {actions.pending === action ? `${action.slice(0, -1)}ing` : action}
          </Button>
        ))}
        {done ? <ScoreButton run={run} actions={actions} onScore={() => void score(false)} /> : null}
      </div>

      {actions.error ? (
        <div className="shrink-0 px-6 pb-3">
          <p role="alert" className="max-w-[68ch] border-l-2 border-fault pl-3 text-small text-fault">
            {actions.error}
            {actions.unfinished === null ? null : (
              <button type="button" onClick={() => void score(true)} className="ml-2 underline underline-offset-2">
                {actions.unfinished > 0 ? `Score anyway, ${actions.unfinished} unfinished` : "Score anyway"}
              </button>
            )}
          </p>
        </div>
      ) : null}

    </>
  );
}

/**
 * The one thing left to do with a finished run, and the only place on the page
 * that offers it. A run still moving does not offer it at all: there is nothing
 * to score until every email has landed, and a button that refuses itself is
 * worse than no button.
 *
 * Scoring and reading the score are the same button in its two states. The
 * scorer's answer is a page and not a panel, so either way this ends on the
 * results, which is where the three components and the answer key live.
 */
function ScoreButton({ run, actions, onScore }: { run: RunSummary; actions: RunActions; onScore: () => void }) {
  const router = useRouter();
  const submitted = run.lastSubmission !== null;
  return (
    <Button
      variant="primary"
      disabled={actions.pending !== null || (!submitted && run.finishedEmails === 0)}
      onClick={submitted ? () => router.push(`/runs/${run.id}/results`) : onScore}
    >
      {actions.pending === "submit" ? "Scoring" : submitted ? "Go to review" : "Score run"}
    </Button>
  );
}
