"use client";

import useSWR from "swr";

import { RunLive } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { StreamingText } from "./streaming-text";

const POLL_MS = 1000;
const fetchLive = parsedFetcher(RunLive);

interface Props {
  runId: string;
  live: boolean;
  onSelect: (emailId: string) => void;
}

/** Every email a model is answering right now, with what it has written so far, refreshed each second. */
export function WorkingNow({ runId, live, onSelect }: Props) {
  const { data, error } = useSWR(live ? `/api/runs/${runId}/live` : null, fetchLive, { refreshInterval: POLL_MS });
  if (!live) return null;
  const calls = data?.calls ?? [];

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">Working now</h2>
      {error instanceof Error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      {calls.length === 0 && !error && <p className="mt-2 text-sm text-muted">No model call is running this second.</p>}
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        {calls.map((call) => (
          <button key={`${call.emailId}-${call.step}`} type="button" onClick={() => onSelect(call.emailId)} className="text-left">
            <div className="mb-1 font-mono text-xs text-muted">{call.emailId}</div>
            <StreamingText call={call} />
          </button>
        ))}
      </div>
    </section>
  );
}
