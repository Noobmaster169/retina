"use client";

import useSWR from "swr";

import { TopBar } from "@/components/shell/top-bar";
import { FlowPanel } from "@/components/run/flow-panel";
import { MachineryPanel } from "@/components/run/machinery-panel";
import { QueuePanel } from "@/components/run/queue-panel";
import { RunHeader, statusWord } from "@/components/run/run-header";
import { PageContext } from "@/components/dock/page-context-announcer";
import { NavCounts } from "@/components/shell/nav-counts";
import { HealthReport, RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { degraded, runSummaryLine } from "./reading";
import { useRunActions } from "./use-run-actions";

/**
 * The run page in its three states, which are one page and not three: a
 * running run, a run with a dependency down, and a finished one. The panels
 * that have nothing to show are replaced rather than padded, which is the
 * whole argument of the trouble and finished boards.
 */

/** A live run is polled at the rate the phase 7 spec sets; a finished one is not polled at all. */
const LIVE_MS = 2000;
const HEALTH_MS = 10_000;

export function RunPage({ initialRun }: { initialRun: RunSummary }) {
  const id = initialRun.id;
  const { data: run = initialRun, mutate } = useSWR(`/api/runs/${id}`, parsedFetcher(RunSummary), {
    fallbackData: initialRun,
    refreshInterval: initialRun.processingDone ? 0 : LIVE_MS,
    keepPreviousData: true,
  });
  const live = !run.processingDone;
  const { data: queues } = useSWR(`/api/runs/${id}/queues`, parsedFetcher(RunQueuesView), {
    refreshInterval: live ? LIVE_MS : 0,
    keepPreviousData: true,
  });
  const { data: health = null } = useSWR("/api/health", parsedFetcher(HealthReport), {
    refreshInterval: HEALTH_MS,
    keepPreviousData: true,
  });

  const actions = useRunActions(id, () => void mutate());
  const status = statusWord(run, degraded(health, queues ?? null));
  // A paused run is still polled, because someone else may resume it, but
  // nothing on it may go on moving: every sweep and every lit card is a claim
  // that work is happening, and after a pause none is.
  const paused = run.status === "paused";

  return (
    <>
      <PageContext refs={[{ kind: "run", id: id, title: `run ${id.slice(0, 8)}` }]} />
      <NavCounts counts={{ inbox: run.totalEmails ?? undefined }} alerts={{ inbox: run.review.open }} />
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Runs", href: "/runs" }, { label: id.slice(0, 8), mono: true }]}>
          <span className={`inline-flex h-[30px] items-center rounded-md px-3 text-small font-medium ${status.tint}`}>
            {status.word}
          </span>
        </TopBar>

        <RunHeader run={run} summary={runSummaryLine(run, queues ?? null)} actions={actions} />

        <div className="flex min-h-0 grow flex-col gap-4 px-6 pb-6">
          {/*
            One picture of the journey, full width, above everything that
            details a part of it. The dots run only while there is work to
            move, and a paused run has none: every moving thing on this page is
            a claim that something is happening.
          */}
          <div className="flex min-h-0 gap-4">
            <FlowPanel run={run} queues={queues ?? null} live={live} paused={paused} className="min-w-0 grow" />
            <MachineryPanel run={run} className="w-[372px] shrink-0" />
          </div>

          {live && queues ? (
            <div className="flex min-h-0 grow gap-4">
              <QueuePanel
                title="Sorting now"
                queue={queues.classify}
                runId={id}
                paused={paused}
                drained="Every email has been read. Only a comparison request crossed into the second queue, and that queue is still working."
                className="min-w-0 grow"
              />
              <QueuePanel
                title="Checking now"
                queue={queues.compare}
                runId={id}
                paused={paused}
                drained="Nothing is waiting for a check. Every pair that crossed has been judged; the rest of the inbox never needed one."
                className="min-w-0 grow"
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
