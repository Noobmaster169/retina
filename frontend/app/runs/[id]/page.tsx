import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRun, type RunSummary } from "@/lib/api-client";

import { RunDetail } from "./run-detail";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

/** A backend that cannot be reached is a message on the page, as on /runs, not the framework's error screen. */
async function loadRun(id: string): Promise<{ run: RunSummary | null; backendError: string | null }> {
  try {
    return { run: await getRun(id), backendError: null };
  } catch (error) {
    console.error("[runs] backend call failed:", error);
    return { run: null, backendError: "The backend is not reachable right now. Reload in a moment." };
  }
}

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Run ${id.slice(0, 8)} · Retina` };
}

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const { run, backendError } = await loadRun(id);
  if (!run && !backendError) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center gap-4 border-b border-line bg-paper px-5 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Retina Mail
        </Link>
        <Link href="/runs" className="text-sm text-muted hover:text-accent-ink">
          Runs
        </Link>
        <span className="font-mono text-sm text-muted">{id.slice(0, 8)}</span>
        <Link href={`/runs/${id}/results`} className="ml-auto text-sm text-accent-ink hover:underline">
          Results
        </Link>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6">
        {run ? (
          <RunDetail initialRun={run} />
        ) : (
          <p role="alert" className="border-l-2 border-red-700 pl-3 text-sm text-red-700">
            {backendError}
          </p>
        )}
      </main>
    </div>
  );
}
