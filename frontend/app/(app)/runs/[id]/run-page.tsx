"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { TopBar } from "@/components/shell/top-bar";
import { LaneMapPanel } from "@/components/run/lane-map";
import { MachineryPanel } from "@/components/run/machinery-panel";
import { OutcomesPanel } from "@/components/run/outcomes-panel";
import { laneMap } from "@/components/run/progress";
import { stagePeeks } from "@/components/run/stage-peeks";
import { SendersPanel } from "@/components/run/senders-panel";
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

/**
 * A live run is polled; a finished one is not polled at all.
 *
 * Two polls, at two rates, because they are not worth the same. `SUMMARY_MS`
 * carries the numbers a person is actually reading: how many are sorted,
 * checked, differing, waiting for somebody. `SLOTS_MS` carries which email is
 * in which slot, which is the part that moves fastest and the part nobody is
 * reading a value off. Both were two seconds, which is sixty requests a minute
 * from one open tab across the tunnel, for a board whose counts move a few
 * times a second at most.
 *
 * Health is a dependency banner. It was ten seconds; nothing it reports
 * changes on that scale, and a tunnel or a proxy that has gone away is still
 * named within half a minute.
 */
const SUMMARY_MS = 3000;
const SLOTS_MS = 4000;
const HEALTH_MS = 30_000;

export function RunPage({ initialRun }: { initialRun: RunSummary }) {
  const id = initialRun.id;
  const { data: run = initialRun, mutate } = useSWR(`/api/runs/${id}`, parsedFetcher(RunSummary), {
    fallbackData: initialRun,
    refreshInterval: initialRun.processingDone ? 0 : SUMMARY_MS,
    keepPreviousData: true,
  });
  const live = !run.processingDone;
  const { data: queues } = useSWR(`/api/runs/${id}/queues`, parsedFetcher(RunQueuesView), {
    refreshInterval: live ? SLOTS_MS : 0,
    keepPreviousData: true,
  });
  const { data: health = null } = useSWR("/api/health", parsedFetcher(HealthReport), {
    refreshInterval: HEALTH_MS,
    keepPreviousData: true,
  });

  // Same reason as the flow panel: the poll hands down new objects twice a
  // second, and rebuilding the map from them re-ran every card's arrival
  // animation for numbers that had not moved. One string of every number the
  // map reads, so the work happens when something changed and not before.
  const counted = [
    run.status,
    run.totalEmails,
    run.outcomes.ok,
    run.outcomes.mismatch,
    run.review.open,
    Object.values(run.stageCounts).join(","),
    queues?.handoff.needCheck,
    queues?.handoff.notComparable,
    queues?.handoff.awaitingDraft,
    queues?.classify.active,
    queues?.classify.concurrency,
    queues?.classify.heldUntil,
    queues?.compare.active,
    queues?.compare.concurrency,
    queues?.compare.waiting,
    queues?.compare.heldUntil,
  ].join("|");
  const map = useMemo(
    () => (queues ? laneMap(run, queues) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `counted` is every number the map reads.
    [counted],
  );

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

        {/*
          The page scrolls, the panels do not. It used to be one flex column
          filling exactly the height left over, which worked while everything
          on it fit; the moment the senders were added under the run, there was
          more than a screenful and nowhere for it to go, so the panels above
          were squeezed instead and the flow lost most of its height.
        */}
        <div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-6 pb-6">
          {queues ? (
            <LaneMapPanel
              map={map ?? laneMap(run, queues)}
              note={laneNote(live, paused, queues.compare.heldUntil !== null)}
              slots={{ classify: queues.classify.concurrency, compare: queues.compare.concurrency }}
              flowing={live && !paused}
              peeks={stagePeeks(queues)}
              runId={id}
            />
          ) : null}

          {/*
            The flow first in both states, and at full width while a run is
            live. It used to come third in that row, behind two fixed panels,
            which left the one picture of the whole run the narrowest thing on
            the page exactly while it had something to show.
          */}
          <div className="flex min-h-[400px] shrink-0 gap-4">
            <OutcomesPanel
              run={run}
              notComparable={queues?.handoff.notComparable ?? 0}
              awaitingDraft={queues?.handoff.awaitingDraft ?? 0}
              live={live}
              paused={paused}
              className="min-w-0 grow"
            />
            {/* Always, now the queues have no panel of their own: while a run
                works this is the only thing on the page whose numbers climb. */}
            <MachineryPanel run={run} className="w-[372px] shrink-0" />
          </div>

          {/*
            Under everything, because it is the one control on this page and
            not a reading of the run: who gets served first decides the shape
            of the next replay rather than describing this one.
          */}
          <SendersPanel className="shrink-0" />
        </div>
      </div>
    </>
  );
}

function laneNote(live: boolean, paused: boolean, held: boolean): string {
  if (paused) return "Paused. Both queues keep what they were given and start nothing new.";
  if (held) return "Sorting is unaffected. Checking is held, so the emails between them pile up.";
  if (!live) return "Both queues drained.";
  return "Two queues, running side by side. Only a document check crosses from one to the other.";
}
