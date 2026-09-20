"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";

import { HealthReport } from "@/lib/api/queues-schemas";
import { RunList, type RunSummary } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { Rail } from "./rail";
import type { NavCounts } from "./nav";

/**
 * Every screen is this: a rail, then panes a hairline apart.
 *
 * The shell owns the run in context and fetches it itself, so the rail is
 * identical on every route and a page never has to hand it anything but which
 * destination is current. A rail that gained a block on one route and lost it
 * on the next made moving around feel like changing product.
 *
 * Without a run id, the context is the newest run there is. That is what makes
 * the run list, which has no run of its own, still look like the same
 * application as everything else.
 */

const RUNS_MS = 5000;
const HEALTH_MS = 10_000;

interface AppShellProps {
  active: string;
  counts: NavCounts;
  children: ReactNode;
  /** The run this page is about. Null on the run list, which takes the newest. */
  runId?: string | null;
  /**
   * A pane asking for the rail's width. Flipping it closes the rail and
   * flipping it back reopens it, unless the person has since decided
   * otherwise: their click on the rail's own control always wins.
   */
  wantsWidth?: boolean;
}

export function AppShell({ active, counts, children, runId = null, wantsWidth = false }: AppShellProps) {
  const { data: list } = useSWR("/api/runs", parsedFetcher(RunList), {
    refreshInterval: RUNS_MS,
    keepPreviousData: true,
  });
  const { data: health = null } = useSWR("/api/health", parsedFetcher(HealthReport), {
    refreshInterval: HEALTH_MS,
    keepPreviousData: true,
  });

  const runs = list?.runs ?? [];
  const current = pick(runs, runId);
  const rail = useRailWidth(wantsWidth);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <Rail
        open={rail.open}
        onToggle={rail.toggle}
        active={active}
        counts={counts}
        current={current}
        runs={runs}
        health={health}
      />
      {children}
    </div>
  );
}

/** The run this page names, or the newest one, so the shell always has a context to read through. */
function pick(runs: RunSummary[], runId: string | null): RunSummary | null {
  if (runId) return runs.find((run) => run.id === runId) ?? null;
  return runs[0] ?? null;
}

function useRailWidth(wantsWidth: boolean) {
  const [open, setOpen] = useState(!wantsWidth);
  const [override, setOverride] = useState(false);
  const previous = useRef(wantsWidth);

  useEffect(() => {
    if (previous.current === wantsWidth) return;
    previous.current = wantsWidth;
    // A new request supersedes an earlier manual choice: the person asked for
    // this pane, not for the rail they set two screens ago.
    setOverride(false);
    setOpen(!wantsWidth);
  }, [wantsWidth]);

  return {
    open: override ? open : !wantsWidth,
    toggle: () => {
      setOverride(true);
      setOpen((was) => !was);
    },
  };
}
