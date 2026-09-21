import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRun, type RunSummary } from "@/lib/api-client";

import { RunPage } from "./run-page";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

/** A backend that cannot be reached is a message on the page, not the framework's error screen. */
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
  return { title: `Run ${id.slice(0, 8)} · Retina SDOC` };
}

export default async function Page({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const { run, backendError } = await loadRun(id);
  if (!run && !backendError) notFound();
  if (!run) {
    return (
      <main className="flex h-dvh items-center justify-center px-6">
        <p role="alert" className="max-w-[48ch] border-l-2 border-fault pl-3 text-body text-fault">
          {backendError}
        </p>
      </main>
    );
  }
  return <RunPage initialRun={run} />;
}
