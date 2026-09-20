"use client";

import useSWR from "swr";

import { Bar } from "@/components/ui/panel";
import { RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

/**
 * What the rail carries while a person is reading one email: the run it came
 * from, and how far through its checks that run is. The board hangs this at
 * the foot of the rail so someone working through a queue can see it emptying
 * without leaving the email they are on.
 */
export function EmailRail({ runId }: { runId: string }) {
  const { data: run } = useSWR(`/api/runs/${runId}`, parsedFetcher(RunSummary), { keepPreviousData: true });
  const { data: queues } = useSWR(`/api/runs/${runId}/queues`, parsedFetcher(RunQueuesView), { keepPreviousData: true });
  if (!run) return <span className="grow" />;

  const needed = queues?.handoff.needCheck ?? 0;
  const checked = run.outcomes.ok + run.outcomes.mismatch + run.review.open;
  const name = runNameOf(run.startedAt ?? run.createdAt);

  return (
    <>
      <span className="grow" />
      <div className="p-4">
        <div className="rounded-lg border border-hairline px-3 py-3">
          <div className="text-strong font-medium">{name}</div>
          <div className="mt-1 text-small text-ink-tertiary">
            {needed === 0 ? `${run.finishedEmails} of ${run.totalEmails ?? "?"} finished` : `${checked} of ${needed} checked`}
          </div>
          <div className="mt-2.5">
            <Bar
              pct={needed === 0 ? 100 : (checked / needed) * 100}
              tone={run.processingDone ? "var(--ink-faint)" : "var(--signal)"}
              height={4}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** The same naming the run page uses, so the two pages call one run the same thing. */
function runNameOf(at: string): string {
  const hour = new Date(at).getHours();
  const part = hour < 5 ? "Overnight" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return `${part} run`;
}
