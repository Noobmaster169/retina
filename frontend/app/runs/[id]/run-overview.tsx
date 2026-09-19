"use client";

import type { RunSummary, Stage } from "@/lib/api/runs-schemas";

const STAGES: Stage[] = ["ingested", "classifying", "classified", "comparing", "review", "done", "failed"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-32">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** Where the run is, what its model calls cost, and how often the verifier had to step in. */
export function RunOverview({ run, error }: { run: RunSummary; error: string | null }) {
  const prompts = Object.entries(run.promptSet);

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Run {run.id.slice(0, 8)}</h1>
        <span className="text-sm text-muted">{run.status}</span>
        {prompts.length > 0 && (
          <span className="text-sm text-muted">
            {prompts.map(([step, pinned]) => `${step} ${pinned.version} on ${pinned.model}`).join(" · ")}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-4 border-y border-line py-4">
        <Stat label="Finished" value={`${run.finishedEmails} / ${run.totalEmails ?? "?"}`} hint={run.stageCounts.failed ? `${run.stageCounts.failed} failed` : undefined} />
        <Stat label="Model calls" value={String(run.llm.calls)} hint={run.llm.failedCalls ? `${run.llm.failedCalls} failed` : undefined} />
        <Stat label="Verifier ran on" value={percent(run.llm.verifierShare)} hint="of classified emails" />
        <Stat label="Tokens" value={`${run.llm.inputTokens.toLocaleString()} in`} hint={`${run.llm.outputTokens.toLocaleString()} out`} />
        <Stat label="Cost at API prices" value={`$${run.llm.costUsd.toFixed(2)}`} hint="not billed on the subscription" />
        {run.lastSubmission?.scores && (
          <Stat label="Stage 1 macro-F1" value={run.lastSubmission.scores.stage1MacroF1.toFixed(4)} hint="last submission" />
        )}
      </dl>

      <ul className="mt-3 flex flex-wrap gap-x-4 text-xs text-muted">
        {STAGES.filter((stage) => run.stageCounts[stage] > 0).map((stage) => (
          <li key={stage} className={stage === "failed" ? "text-red-700" : undefined}>
            {stage} <span className="tabular-nums text-ink">{run.stageCounts[stage]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
