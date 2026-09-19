"use client";

import { useState } from "react";

import type { RunAction, RunStatus, RunSummary, Stage } from "@/lib/api-client";

import { ScoreCell } from "./score-cell";

const STAGES: Stage[] = ["ingested", "classifying", "classified", "comparing", "review", "done", "failed"];

const ACTIONS: Record<RunStatus, RunAction[]> = {
  created: ["pause", "cancel"],
  running: ["pause", "cancel"],
  paused: ["resume", "cancel"],
  completed: [],
  cancelled: [],
  failed: [],
};

const STATUS_TONE: Record<RunStatus, string> = {
  created: "text-muted",
  running: "text-accent-ink",
  paused: "text-amber-700",
  completed: "text-ink",
  cancelled: "text-muted",
  failed: "text-red-700",
};

function startedLabel(run: RunSummary): string {
  return new Date(run.startedAt ?? run.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface Props {
  run: RunSummary;
  onChanged: () => void;
}

export function RunRow({ run, onChanged }: Props) {
  const [pending, setPending] = useState<RunAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settled = run.stageCounts.done + run.stageCounts.failed;
  const percent = run.totalEmails ? Math.round((settled / run.totalEmails) * 100) : 0;

  async function act(action: RunAction) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${run.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed with ${response.status}`);
      }
      onChanged();
    } catch (cause) {
      console.error("[runs] action failed:", cause);
      setError("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-4 whitespace-nowrap">
        <div>{startedLabel(run)}</div>
        <div className="font-mono text-xs text-muted">{run.id.slice(0, 8)}</div>
      </td>
      <td className={`py-3 pr-4 font-medium ${STATUS_TONE[run.status]}`}>{run.status}</td>
      <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-muted">
        {run.ratePerSecond === 0 ? "burst" : `${run.ratePerSecond}/s`}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Emails finished"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 w-28 overflow-hidden rounded-full bg-sel"
          >
            <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
          <span className="whitespace-nowrap tabular-nums">
            {settled} / {run.totalEmails ?? "?"}
          </span>
        </div>
      </td>
      <td className="py-3 pr-4">
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          {STAGES.filter((stage) => run.stageCounts[stage] > 0).map((stage) => (
            <li key={stage} className={stage === "failed" ? "text-red-700" : undefined}>
              {stage} <span className="tabular-nums text-ink">{run.stageCounts[stage]}</span>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
      </td>
      <td className="py-3 pr-4">
        <ScoreCell run={run} onChanged={onChanged} />
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        {ACTIONS[run.status].map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => void act(action)}
            className="ml-2 rounded-md border border-line px-2.5 py-1 text-xs capitalize hover:border-accent hover:text-accent-ink disabled:opacity-50"
          >
            {pending === action ? "…" : action}
          </button>
        ))}
      </td>
    </tr>
  );
}
