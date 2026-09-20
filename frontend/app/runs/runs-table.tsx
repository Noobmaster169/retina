"use client";

import useSWR from "swr";

import { RunList } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { NewRunForm } from "./new-run-form";
import { RunRow } from "./run-row";

const POLL_MS = 3000;

const fetchRuns = parsedFetcher(RunList);

interface Props {
  initialList: RunList | null;
  initialError: string | null;
}

/** The list, kept fresh by polling: long work is queued, never awaited by a request. */
export function RunsTable({ initialList, initialError }: Props) {
  const { data, error, mutate } = useSWR("/api/runs", fetchRuns, {
    fallbackData: initialList ?? undefined,
    refreshInterval: POLL_MS,
    revalidateOnMount: initialError !== null,
  });
  const runs = data?.runs ?? [];
  const queues = runs[0]?.queues;
  const message = error instanceof Error ? error.message : !data ? initialError : null;

  return (
    <>
      <NewRunForm onCreated={() => void mutate()} />

      {data && (
        <p className="mt-6 text-sm text-ink-tertiary">
          <span className="font-medium text-ink">Parallel</span> {data.concurrency.classify} emails at once,{" "}
          {data.concurrency.llm} model calls in flight. Set by <code>CLASSIFY_CONCURRENCY</code> and{" "}
          <code>LLM_MAX_CONCURRENCY</code> in the backend env.
        </p>
      )}

      {queues && (
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm text-ink-tertiary">
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

      {runs.length > 0 && !queues && <p className="mt-6 text-sm text-ink-tertiary">Queue counts are unavailable right now.</p>}

      {message && (
        <p role="alert" className="mt-4 border-l-2 border-fault pl-3 text-sm text-fault">
          {message}
        </p>
      )}

      <div className="mt-4 overflow-x-auto border-t border-hairline">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-tertiary">
            <tr className="border-b border-hairline">
              <th className="py-2 pr-4 font-medium">Started</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Rate</th>
              <th className="py-2 pr-4 font-medium">Progress</th>
              <th className="py-2 pr-4 font-medium">Stages</th>
              <th className="py-2 pr-4 font-medium">Score</th>
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
          <p className="py-10 text-center text-sm text-ink-tertiary">No runs yet. Start one above.</p>
        )}
      </div>
    </>
  );
}
