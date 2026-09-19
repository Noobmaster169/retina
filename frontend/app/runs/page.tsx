import type { Metadata } from "next";
import Link from "next/link";

import { listRuns, type RunSummary } from "@/lib/api-client";

import { RunsTable } from "./runs-table";

// Reads the backend on every request; there is nothing here to prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Runs · Retina" };

async function loadRuns(): Promise<{ runs: RunSummary[]; backendError: string | null }> {
  try {
    return { runs: await listRuns(), backendError: null };
  } catch (error) {
    console.error("[runs] backend call failed:", error);
    return { runs: [], backendError: "The backend is not reachable right now." };
  }
}

export default async function RunsPage() {
  const { runs, backendError } = await loadRuns();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center gap-4 border-b border-line bg-paper px-5 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Retina Mail
        </Link>
        <span className="text-sm text-muted">Runs</span>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A run replays the inbox through the pipeline. Each one keeps its own results, so two can be compared on the
          same emails.
        </p>
        <RunsTable initialRuns={runs} initialError={backendError} />
      </main>
    </div>
  );
}
