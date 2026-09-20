import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { Search, TopBar } from "@/components/shell/top-bar";
import { listRuns, type RunList } from "@/lib/api-client";

import { RunsTable } from "./runs-table";

// Reads the backend on every request; there is nothing here to prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Runs · Retina SDOC" };

async function loadRuns(): Promise<{ list: RunList | null; backendError: string | null }> {
  try {
    return { list: await listRuns(), backendError: null };
  } catch (error) {
    console.error("[runs] backend call failed:", error);
    return { list: null, backendError: "The backend is not reachable right now." };
  }
}

export default async function RunsPage() {
  const { list, backendError } = await loadRuns();

  return (
    <AppShell active="" counts={{}}>
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Runs" }]}>
          <Search />
        </TopBar>
        <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
          <div className="py-5">
            <h1 className="font-display text-display font-normal tracking-[-0.01em]">Runs</h1>
            <p className="mt-0.5 max-w-[68ch] text-body text-ink-tertiary">
              A run replays the inbox through the pipeline and keeps its own results, so two can be compared on the
              same emails. Every other screen reads through whichever run the rail has in context.
            </p>
          </div>
          <RunsTable initialList={list} initialError={backendError} />
        </main>
      </div>
    </AppShell>
  );
}
