"use client";

import { useState } from "react";

import type { RunSummary } from "@/lib/api-client";

interface LocalEval {
  run: { finalScore: number; stage1MacroF1: number; endToEndRate: number; nEmails: number };
  holdout: { finalScore: number; stage1MacroF1: number; endToEndRate: number; nEmails: number };
  wrongCategory: number;
}

const BUTTON =
  "rounded-md border border-line px-2.5 py-1 text-xs hover:border-accent hover:text-accent-ink disabled:opacity-50";

const score = (value: number) => value.toFixed(4);

interface Props {
  run: RunSummary;
  onChanged: () => void;
}

/** What the run scored, what it cost, and the button that sends it to the organisers' scorer. */
export function ScoreCell({ run, onChanged }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<number | null>(null);
  const [local, setLocal] = useState<LocalEval | "unavailable" | null>(null);

  const last = run.lastSubmission;
  const hasEmails = Object.values(run.stageCounts).some((count) => count > 0);

  async function submit(force: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${run.id}/submit?force=${force}`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; incomplete?: string[] };
      if (response.status === 409 && body.incomplete) setUnfinished(body.incomplete.length);
      else if (!response.ok) setError(body.error ?? `Request failed with ${response.status}`);
      else setUnfinished(null);
      onChanged();
    } catch (cause) {
      console.error("[runs] submit failed:", cause);
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  async function evaluate() {
    setPending(true);
    try {
      const response = await fetch(`/api/runs/${run.id}/eval`);
      setLocal(response.ok ? ((await response.json()) as LocalEval) : "unavailable");
    } catch (cause) {
      console.error("[runs] eval failed:", cause);
      setLocal("unavailable");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {last?.finalScore != null ? (
        <div>
          <span className="text-base font-semibold tabular-nums text-ink">{score(last.finalScore)}</span>
          <span className="ml-2 text-muted">
            over {last.nEmails} emails{last.forced ? ", forced" : ""}
          </span>
          {last.scores && (
            <dl className="mt-0.5 flex flex-wrap gap-x-3 text-muted">
              <div>
                <dt className="inline">stage 1 </dt>
                <dd className="inline tabular-nums text-ink">{score(last.scores.stage1MacroF1)}</dd>
              </div>
              <div>
                <dt className="inline">stage 3 </dt>
                <dd className="inline tabular-nums text-ink">{score(last.scores.stage3DefectF1)}</dd>
              </div>
              <div>
                <dt className="inline">end to end </dt>
                <dd className="inline tabular-nums text-ink">{score(last.scores.endToEndRate)}</dd>
              </div>
              <div>
                <dt className="inline">escalation </dt>
                <dd className="inline tabular-nums text-ink">
                  {score(last.scores.escalationRecall)} / {score(last.scores.escalationPrecision)}
                </dd>
              </div>
            </dl>
          )}
        </div>
      ) : (
        <span className="text-muted">Not submitted</span>
      )}

      <div className="tabular-nums text-muted">
        {run.llm.calls} model calls{run.llm.failedCalls > 0 ? `, ${run.llm.failedCalls} failed` : ""} · $
        {run.llm.costUsd.toFixed(2)} at API prices
      </div>

      {local && local !== "unavailable" && (
        <div className="tabular-nums text-muted">
          local eval: this run {score(local.run.stage1MacroF1)} stage 1 over {local.run.nEmails}, holdout{" "}
          {score(local.holdout.stage1MacroF1)} over {local.holdout.nEmails}, {local.wrongCategory} wrong
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !hasEmails} onClick={() => void submit(false)} className={BUTTON}>
          {pending ? "…" : last ? "Submit again" : "Submit"}
        </button>
        {unfinished !== null && (
          <button type="button" disabled={pending} onClick={() => void submit(true)} className={BUTTON}>
            {unfinished} unfinished, submit anyway
          </button>
        )}
        {local !== "unavailable" && (
          <button type="button" disabled={pending || !hasEmails} onClick={() => void evaluate()} className={BUTTON}>
            Local eval
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
