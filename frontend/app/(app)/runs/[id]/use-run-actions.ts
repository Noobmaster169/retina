"use client";

import { useState } from "react";

import type { RunSummary } from "@/lib/api/runs-schemas";

/**
 * Everything a person can do to a run, in one place, because the header and
 * the page itself both reach for them. The refusals matter as much as the
 * successes: the API refuses a submission of a run whose emails are still
 * moving, and says whether `force` would get past it.
 */

export type RunAction = "pause" | "resume" | "cancel";

/**
 * Which controls a run in this state offers.
 *
 * Not a table keyed on the status, because `completed` is the ingest's word
 * and not the pipeline's: a run reads completed the moment its last email is
 * enqueued, with both queues still full. Keyed on the status alone, a run in
 * that state offered nothing, and the two buttons vanished from under the
 * cursor halfway through every replay. `processingDone` is the field that
 * means what a person reading "finished" would take it to mean.
 */
export function controlsFor(run: Pick<RunSummary, "status" | "processingDone">): RunAction[] {
  if (run.status === "paused") return ["resume", "cancel"];
  if (run.processingDone) return [];
  return run.status === "created" || run.status === "running" || run.status === "completed"
    ? ["pause", "cancel"]
    : [];
}

export interface RunActions {
  pending: string | null;
  error: string | null;
  /** How many emails a refused submission said were unfinished. Null when forcing would not help. */
  unfinished: number | null;
  control: (action: RunAction) => Promise<void>;
  /** What a person calls this run. An empty name takes it back to being named by its clock. */
  rename: (name: string) => Promise<void>;
  /** True when the scorer took it. The header waits for that before it moves anyone to the results. */
  submit: (force: boolean) => Promise<boolean>;
}

export function useRunActions(runId: string, onChanged: () => void): RunActions {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<number | null>(null);

  async function run<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    setPending(label);
    setError(null);
    try {
      return await work();
    } catch (cause) {
      console.error(`[runs] ${label} failed:`, cause);
      setError("Could not reach the server.");
      return undefined;
    } finally {
      setPending(null);
    }
  }

  return {
    pending,
    error,
    unfinished,
    control: async (action) => {
      await run(action, async () => {
        const response = await fetch(`/api/runs/${runId}/${action}`, { method: "POST" });
        if (!response.ok) setError(await refusal(response));
        onChanged();
      });
    },
    rename: async (name) => {
      await run("rename", async () => {
        const response = await fetch(`/api/runs/${runId}/rename`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) setError(await refusal(response));
        onChanged();
      });
    },
    submit: async (force) =>
      (await run("submit", async () => {
        const response = await fetch(`/api/runs/${runId}/submit?force=${force}`, { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as { error?: string; incomplete?: string[]; forcible?: boolean };
        if (response.ok) setUnfinished(null);
        else {
          setError(body.error ?? `Request failed with ${response.status}`);
          setUnfinished(body.forcible ? (body.incomplete?.length ?? 0) : null);
        }
        onChanged();
        return response.ok;
      })) ?? false,
  };
}

async function refusal(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Request failed with ${response.status}`;
}
