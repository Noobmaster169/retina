"use client";

import useSWR from "swr";
import { z } from "zod";

import { type LlmCall, LlmCallList } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

const POLL_MS = 2000;
const fetchCalls = parsedFetcher(LlmCallList);

/** The part of a parsed answer worth a glance in the feed. Both steps answer with these two. */
const Verdict = z.object({ category: z.string(), confidence: z.number() });

function verdictOf(call: LlmCall): string {
  const verdict = Verdict.safeParse(call.parsed);
  return verdict.success ? `${verdict.data.category} at ${verdict.data.confidence.toFixed(2)}` : "";
}

interface Props {
  runId: string;
  onSelect: (emailId: string) => void;
}

/** The run's newest model calls, refreshed every two seconds, so a running run can be watched call by call. */
export function LiveFeed({ runId, onSelect }: Props) {
  const { data, error } = useSWR(`/api/runs/${runId}/calls`, fetchCalls, { refreshInterval: POLL_MS });
  const calls = data?.calls ?? [];

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">Latest model calls</h2>
      {error instanceof Error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      {calls.length === 0 && !error && <p className="mt-2 text-sm text-muted">No model call yet.</p>}
      <ol className="mt-2 max-h-56 overflow-y-auto border-y border-line text-sm">
        {calls.map((call) => (
          <li key={call.id}>
            <button
              type="button"
              disabled={!call.emailId}
              onClick={() => call.emailId && onSelect(call.emailId)}
              className="flex w-full flex-wrap items-baseline gap-x-4 border-b border-line px-1 py-1.5 text-left last:border-b-0 hover:bg-paper"
            >
              <span className="w-20 text-xs tabular-nums text-muted">{new Date(call.createdAt).toLocaleTimeString()}</span>
              <span className="w-24 font-mono text-xs">{call.emailId}</span>
              <span className="w-32 text-xs text-muted">
                {call.step} {call.promptVersion}
              </span>
              <span className={`w-12 text-xs ${call.ok ? "text-accent-ink" : "text-red-700"}`}>{call.ok ? "ok" : "failed"}</span>
              <span className="text-xs">{call.ok ? verdictOf(call) : call.error}</span>
              <span className="ml-auto text-xs tabular-nums text-muted">{(call.latencyMs / 1000).toFixed(1)} s</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
