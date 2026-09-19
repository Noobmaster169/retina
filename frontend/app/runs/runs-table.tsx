"use client";

import useSWR from "swr";

import type { RunSummary } from "@/lib/api-client";

import { NewRunForm } from "./new-run-form";
import { RunRow } from "./run-row";

const POLL_MS = 3000;

async function fetchRuns(url: string): Promise<RunSummary[]> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as { runs?: RunSummary[]; error?: string };
  if (!response.ok || !body.runs) throw new Error(body.error ?? `Request failed with ${response.status}`);
  return body.runs;
}

interface Props {
  initialRuns: RunSummary[];
  initialError: string | null;
}

/** The list, kept fresh by polling: long work is queued, never awaited by a request. */
export function RunsTable({ initialRuns, initialError }: Props) {
  const { data, error, mutate } = useSWR("/api/runs", fetchRuns, {
    fallbackData: initialRuns,
    refreshInterval: POLL_MS,
    revalidateOnMount: initialError !== null,
  });
  const runs = data ?? [];
  const queues = runs[0]?.queues;
  const message = error instanceof Error ? error.message : data === initialRuns ? initialError : null;

  return (
    <>
      <NewRunForm onCreated={() => void mutate()} />

      {queues && (
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted">
          {(["classify", "compare"] as const).map((name) => (
            <div key={name} className="flex gap-2">
              <dt className="font-medium text-ink">{name} queue</dt>
              <dd className="tabular-nums">
                {queues[name].waiting} waiting · {queues[name].active} active · {queues[name].failed} failed
              </dd>
            </div>
          ))}
        </dl>
      )}

      {runs.length > 0 && !queues && <p className="mt-6 text-sm text-muted">Queue counts are unavailable right now.</p>}

      {message && (
        <p role="alert" className="mt-4 border-l-2 border-red-700 pl-3 text-sm text-red-700">
          {message}
        </p>
      )}

      <div className="mt-4 overflow-x-auto border-t border-line">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-medium">Started</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Rate</th>
              <th className="py-2 pr-4 font-medium">Progress</th>
              <th className="py-2 pr-4 font-medium">Stages</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <RunRow key={run.id} run={run} onChanged={() => void mutate()} />
            ))}
          </tbody>
        </table>
        {runs.length === 0 && !message && (
          <p className="py-10 text-center text-sm text-muted">No runs yet. Start one above.</p>
        )}
      </div>
    </>
  );
}
