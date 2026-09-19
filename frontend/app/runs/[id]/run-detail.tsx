"use client";

import { useState } from "react";

import type { RunSummary } from "@/lib/api/runs-schemas";

import { EmailTrace } from "./email-trace";
import { LiveFeed } from "./live-feed";
import { RunEmails } from "./run-emails";
import { RunOverview } from "./run-overview";

interface Props {
  initialRun: RunSummary;
}

/** The run's numbers on top; its emails on the left; the chosen email's model calls on the right. */
export function RunDetail({ initialRun }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const runId = initialRun.id;

  return (
    <>
      <RunOverview initialRun={initialRun} />
      <LiveFeed runId={runId} onSelect={setSelected} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <RunEmails runId={runId} selected={selected} onSelect={setSelected} />
        <EmailTrace runId={runId} emailId={selected} />
      </div>
    </>
  );
}
