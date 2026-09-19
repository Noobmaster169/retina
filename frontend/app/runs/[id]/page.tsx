import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRun } from "@/lib/api-client";

import { RunDetail } from "./run-detail";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Run ${id.slice(0, 8)} · Retina` };
}

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const run = await getRun(id);
  if (!run) notFound();

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
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6">
        <RunDetail initialRun={run} />
      </main>
    </div>
  );
}
