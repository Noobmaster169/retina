"use client";

import useSWR from "swr";

import { AppShell } from "@/components/shell/app-shell";
import { Search, TopBar } from "@/components/shell/top-bar";
import { LaneMapPanel } from "@/components/run/lane-map";
import { MachineryPanel } from "@/components/run/machinery-panel";
import { OutcomesPanel } from "@/components/run/outcomes-panel";
import { laneMap } from "@/components/run/progress";
import { QueuePanel } from "@/components/run/queue-panel";
import { RunHeader, statusWord } from "@/components/run/run-header";
import { ScorePanel } from "@/components/run/score-panel";
import { HealthReport, RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { runSummaryLine, troubleOf } from "./reading";
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
  const trouble = troubleOf(health, queues ?? null);
  const status = statusWord(run, trouble !== null);

  return (
    <AppShell active="overview" runId={id} counts={{ inbox: run.totalEmails ?? undefined, review: run.review.open }}>
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Runs", href: "/runs" }, { label: id.slice(0, 8), mono: true }]}>
          <Search />
          <span className={`inline-flex h-[30px] items-center rounded-md px-3 text-small font-medium ${status.tint}`}>
            {status.word}
          </span>
        </TopBar>

        <RunHeader run={run} trouble={trouble} summary={runSummaryLine(run, queues ?? null)} actions={actions} />

        <div className="flex min-h-0 grow flex-col gap-4 px-6 pb-6">
          {queues ? (
            <LaneMapPanel
              map={laneMap(run, queues)}
              note={laneNote(live, queues.compare.heldUntil !== null)}
              slots={{ classify: queues.classify.concurrency, compare: queues.compare.concurrency }}
            />
          ) : null}

          <div className="flex min-h-0 grow gap-4">
            {live && queues ? (
              <>
                <QueuePanel
                  title="Sorting now"
                  queue={queues.classify}
                  runId={id}
                  standing={{ label: "Not yet read", count: run.stageCounts.ingested }}
                  drained="Every email has been read. Only a comparison request crossed into the second queue, and that queue is still working."
                  note="Every email is read by a model. Only a comparison request crosses into the second queue."
                  className="w-[372px] shrink-0"
                />
                <QueuePanel
                  title="Checking now"
                  queue={queues.compare}
                  runId={id}
                  standing={{ label: "Waiting for a slot", count: queues.compare.waiting }}
                  drained="Nothing is waiting for a check. Every pair that crossed has been judged; the rest of the inbox never needed one."
                  note="Both queues draw on the same model slots, so a busy sort slows a check."
                  className="w-[372px] shrink-0"
                />
                <OutcomesPanel
                  run={run}
                  notComparable={queues.handoff.notComparable}
                  className="min-w-0 grow"
                />
              </>
            ) : (
              <>
                <OutcomesPanel
                  run={run}
                  notComparable={queues?.handoff.notComparable ?? 0}
                  className="w-[372px] shrink-0"
                />
                <MachineryPanel run={run} className="w-[372px] shrink-0" />
                <ScorePanel run={run} actions={actions} className="min-w-0 grow" />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function laneNote(live: boolean, held: boolean): string {
  if (held) return "Sorting is unaffected. Checking is held, so the emails between them pile up.";
  if (!live) return "Both queues drained.";
  return "Two queues, running side by side. Only a document check crosses from one to the other.";
}
