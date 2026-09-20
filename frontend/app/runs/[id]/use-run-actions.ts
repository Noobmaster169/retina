"use client";

import { useState } from "react";

import type { RunStatus } from "@/lib/api/runs-schemas";
import { LocalEval } from "@/lib/local-eval";

/**
 * Everything a person can do to a run, in one place, because two panels on the
 * run page offer them and neither should own the fetch. The refusals matter as
 * much as the successes: the API refuses a submission of a run whose emails
 * are still moving, and says whether `force` would get past it.
 */

export type RunAction = "pause" | "resume" | "cancel";

/** Which controls a run in this state offers. A finished run offers none of them. */
export const CONTROLS: Record<RunStatus, RunAction[]> = {
  created: ["pause", "cancel"],
  running: ["pause", "cancel"],
  paused: ["resume", "cancel"],
  completed: [],
  cancelled: [],
  failed: [],
};

export interface RunActions {
  pending: string | null;
  error: string | null;
  /** How many emails a refused submission said were unfinished. Null when forcing would not help. */
  unfinished: number | null;
  local: LocalEval | "unavailable" | null;
  control: (action: RunAction) => Promise<void>;
  submit: (force: boolean) => Promise<void>;
  evaluate: () => Promise<void>;
}

export function useRunActions(runId: string, onChanged: () => void): RunActions {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<number | null>(null);
  const [local, setLocal] = useState<LocalEval | "unavailable" | null>(null);

  async function run<T>(label: string, work: () => Promise<T>): Promise<void> {
    setPending(label);
    setError(null);
    try {
      await work();
    } catch (cause) {
      console.error(`[runs] ${label} failed:`, cause);
      setError("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  return {
    pending,
    error,
    unfinished,
    local,
    control: (action) =>
      run(action, async () => {
        const response = await fetch(`/api/runs/${runId}/${action}`, { method: "POST" });
        if (!response.ok) setError(await refusal(response));
        onChanged();
      }),
    submit: (force) =>
      run("submit", async () => {
        const response = await fetch(`/api/runs/${runId}/submit?force=${force}`, { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as { error?: string; incomplete?: string[]; forcible?: boolean };
        if (response.ok) setUnfinished(null);
        else {
          setError(body.error ?? `Request failed with ${response.status}`);
          setUnfinished(body.forcible ? (body.incomplete?.length ?? 0) : null);
        }
        onChanged();
      }),
    evaluate: () =>
      run("eval", async () => {
        const response = await fetch(`/api/runs/${runId}/eval`);
        const parsed = response.ok ? LocalEval.safeParse(await response.json()) : null;
        setLocal(parsed?.success ? parsed.data : "unavailable");
      }),
  };
}

async function refusal(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Request failed with ${response.status}`;
}
