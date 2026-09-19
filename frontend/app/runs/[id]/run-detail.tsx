"use client";

import { useState } from "react";
import useSWR from "swr";

import { RunSummary } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { EmailTrace } from "./email-trace";
import { LiveFeed } from "./live-feed";
import { RunEmails } from "./run-emails";
import { RunOverview } from "./run-overview";

const POLL_MS = 3000;
const fetchRun = parsedFetcher(RunSummary);

interface Props {
  initialRun: RunSummary;
}

/**
 * The run's numbers on top; its emails on the left; the chosen email's model
 * calls on the right. The run is polled here once, and every panel stops
 * polling when the backend says nothing more will happen.
 */
export function RunDetail({ initialRun }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error } = useSWR(`/api/runs/${initialRun.id}`, fetchRun, {
    fallbackData: initialRun,
    refreshInterval: (latest) => (latest?.processingDone ? 0 : POLL_MS),
  });
  const run = data ?? initialRun;
  const live = !run.processingDone;

  return (
    <>
      <RunOverview run={run} error={error instanceof Error ? error.message : null} />
      <LiveFeed runId={run.id} live={live} onSelect={setSelected} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <RunEmails runId={run.id} live={live} selected={selected} onSelect={setSelected} />
        <EmailTrace runId={run.id} emailId={selected} live={live} />
      </div>
    </>
  );
}
