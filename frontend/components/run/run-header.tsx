"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { RunStatus, RunSummary } from "@/lib/api/runs-schemas";
import { CONTROLS, type RunActions } from "@/app/(app)/runs/[id]/use-run-actions";
import { runName } from "@/components/shell/run-name";
import { formatDuration } from "@/lib/duration";

/**
 * The one display line on this page, and the controls beside it. Below it, the
 * trouble banner: present only when a dependency has actually refused work,
 * and absent entirely otherwise rather than reserved as an empty strip.
 */

export interface Trouble {
  /** The dependency that refused, by its own name. */
  what: string;
  /** The error as it was thrown, in mono. The one place on this page an exception is shown verbatim. */
  detail: string;
}

interface RunHeaderProps {
  run: RunSummary;
  trouble: Trouble | null;
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

export function RunHeader({ run, trouble, summary, actions }: RunHeaderProps) {
  const done = run.processingDone;
  const controls = CONTROLS[run.status];
  return (
    <>
      <div className="flex h-[88px] shrink-0 items-center gap-4 px-6">
        <div className="min-w-0">
          <h1 className="font-display text-display font-normal tracking-[-0.01em]">{runName(run)}</h1>
          <p className="mt-0.5 text-body text-ink-tertiary">
            {run.totalEmails === null ? "Counting the inbox" : `${run.totalEmails} emails`}
            {run.ratePerSecond === 0 ? " all at once" : ` at ${run.ratePerSecond} a second`}
            {run.elapsedMs === null ? ", not started yet. " : `, ${formatDuration(run.elapsedMs)}${done ? " in total. " : " in. "}`}
            {summary}
          </p>
        </div>
        <span className="grow" />
        {trouble ? <TroubleChip trouble={trouble} /> : null}
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
        <Button
          variant="primary"
          disabled={actions.pending !== null || run.finishedEmails === 0}
          onClick={() => void actions.submit(false)}
        >
          {actions.pending === "submit" ? "Submitting" : run.lastSubmission ? "Submit again" : "Submit run"}
        </Button>
      </div>

      {actions.error ? (
        <div className="shrink-0 px-6 pb-3">
          <p role="alert" className="max-w-[68ch] border-l-2 border-fault pl-3 text-small text-fault">
            {actions.error}
            {actions.unfinished === null ? null : (
              <button
                type="button"
                onClick={() => void actions.submit(true)}
                className="ml-2 underline underline-offset-2"
              >
                {actions.unfinished > 0 ? `Submit anyway, ${actions.unfinished} unfinished` : "Submit anyway"}
              </button>
            )}
          </p>
        </div>
      ) : null}

    </>
  );
}

/**
 * A dependency refusing work, stated beside the controls rather than in a
 * banner under them. The banner was 68px of layout that appeared and
 * disappeared on a thirty second cycle, and every time it did, the whole page
 * moved. What it said fits in a chip and a tooltip.
 */
function TroubleChip({ trouble }: { trouble: Trouble }) {
  return (
    <Tooltip
      label={
        <>
          <span className="block font-medium text-ink">{trouble.what} is refusing work.</span>
          <span className="mt-1 block">{trouble.detail}</span>
        </>
      }
    >
      <span
        role="status"
        tabIndex={0}
        className="inline-flex h-[34px] shrink-0 cursor-default items-center gap-2 rounded-md bg-differ-tint px-3 text-strong font-medium text-differ"
      >
        <Icon name="warning" size={14} className="shrink-0" />
        <span className="max-w-[180px] truncate">{trouble.what}</span>
      </span>
    </Tooltip>
  );
}
