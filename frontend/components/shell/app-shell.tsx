"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import useSWR from "swr";

import { RunList, type RunSummary } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { Dock } from "@/components/dock/dock";
import { DockProvider } from "@/components/dock/dock-state";
import { ToastHost } from "@/components/ui/toast";

import { activeFor, runIdFrom } from "./nav";
import { NavCountsProvider, useNavCounts } from "./nav-counts";
import { Rail } from "./rail";

/**
 * Every screen is this: a rail, then panes a hairline apart, then the dock.
 *
 * Mounted once by app/(app)/layout.tsx, so the rail, the receipts and the
 * chat survive every navigation. The active destination and the run in
 * context are read off the pathname; a page passes nothing but its counts,
 * through `<NavCounts>`.
 *
 * Without a run id, the context is the newest run there is. That is what makes
 * the run list, which has no run of its own, still look like the same
 * application as everything else.
 */

const RUNS_MS = 5000;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NavCountsProvider>
      <DockProvider>
        <Frame>{children}</Frame>
      </DockProvider>
    </NavCountsProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const runId = runIdFrom(pathname);
  const counts = useNavCounts();
  // The chat page is the conversation, wide; a dock beside it would be the same thread twice.
  const onChatPage = activeFor(pathname) === "chat";
  const { data: list } = useSWR("/api/runs", parsedFetcher(RunList), {
    refreshInterval: RUNS_MS,
    keepPreviousData: true,
  });
  const runs = list?.runs ?? [];
  const current = pick(runs, runId);
  // The rail is open or closed because a person said so, and for no other
  // reason. It used to close itself for a pane that wanted the width, which
  // made switching a tab move the navigation.
  const [railOpen, setRailOpen] = useState(true);

  return (
    <ToastHost>
      <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
        <Rail
          open={railOpen}
          onToggle={() => setRailOpen((was) => !was)}
          active={activeFor(pathname)}
          counts={counts}
          current={current}
          runId={runId}
          runs={runs}
        />
        {children}
        {onChatPage ? null : <Dock />}
      </div>
    </ToastHost>
  );
}

/** The run this page names, or the newest one, so the shell always has a context to read through. */
function pick(runs: RunSummary[], runId: string | null): RunSummary | null {
  if (runId) return runs.find((run) => run.id === runId) ?? null;
  return runs[0] ?? null;
}
