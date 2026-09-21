"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";

import { RunList, type RunSummary } from "@/lib/api/runs-schemas";
import { useMediaQuery } from "@/lib/use-media-query";
import { parsedFetcher } from "@/lib/poll";

import { ToastHost } from "@/components/ui/toast";

import { Rail } from "./rail";
import type { NavAlerts, NavCounts } from "./nav";

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
 *
 * It also hosts the receipts. Every write says what it wrote, and the one
 * place that can be true for every screen is the one that is on all of them.
 */

const RUNS_MS = 5000;

interface AppShellProps {
  active: string;
  counts: NavCounts;
  /** What is waiting on a person, per destination. Tinted in the rail; absent where nothing is. */
  alerts?: NavAlerts;
  children: ReactNode;
  /** The run this page is about. Null on the run list, which takes the newest. */
  runId?: string | null;
}

export function AppShell({ active, counts, alerts = {}, children, runId = null }: AppShellProps) {
  const { data: list } = useSWR("/api/runs", parsedFetcher(RunList), {
    refreshInterval: RUNS_MS,
    keepPreviousData: true,
  });

  const runs = list?.runs ?? [];
  const current = pick(runs, runId);
  // The rail is open or closed because a person said so, and for no other
  // reason. It used to close itself for a pane that wanted the width, which
  // made switching a tab move the navigation.
  //
  // The one exception is a phone, where 232px of navigation is most of the
  // screen. That is not a pane asking for width, it is there being none: the
  // person's choice is kept and applied again the moment there is room.
  const [railOpen, setRailOpen] = useState(true);
  const narrow = useMediaQuery("(max-width: 767px)");

  return (
    <ToastHost>
      <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
        <Rail
          open={railOpen && !narrow}
          onToggle={() => setRailOpen((was) => !was)}
          active={active}
          counts={counts}
          alerts={alerts}
          current={current}
          runs={runs}
        />
        {children}
      </div>
    </ToastHost>
  );
}

/** The run this page names, or the newest one, so the shell always has a context to read through. */
function pick(runs: RunSummary[], runId: string | null): RunSummary | null {
  if (runId) return runs.find((run) => run.id === runId) ?? null;
  return runs[0] ?? null;
}
