"use client";

import { useState } from "react";
import useSWR from "swr";

import { EmailList } from "@/components/email/email-list";
import { AppShell } from "@/components/shell/app-shell";
import { Search, TopBar } from "@/components/shell/top-bar";
import { Icon } from "@/components/ui/icons";
import { RunEmailsPage } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

/**
 * The run's emails, with nothing open yet. It is the same 300px list the email
 * page carries down its left edge, so choosing a message and reading one are
 * the same screen rather than two.
 */

const LIVE_MS = 4000;

interface InboxPageProps {
  runId: string;
  initialList: RunEmailsPage;
  review: number;
}

export function InboxPage({ runId, initialList, review }: InboxPageProps) {
  const [tab, setTab] = useState("all");
  const { data: list = initialList } = useSWR(`/api/runs/${runId}/emails?pageSize=200`, parsedFetcher(RunEmailsPage), {
    fallbackData: initialList,
    refreshInterval: LIVE_MS,
    keepPreviousData: true,
  });

  const differing = list.emails.filter((email) => email.defectFields.length > 0);
  const parked = list.emails.filter((email) => email.outcome !== null && !["OK", "MISMATCH", "not_comparable"].includes(email.outcome));
  const shown = tab === "differences" ? differing : tab === "review" ? parked : list.emails;

  return (
    <AppShell active="inbox" runId={runId} counts={{ inbox: list.total, review }}>
      <EmailList
        runId={runId}
        emails={shown}
        selectedId=""
        active={tab}
        onTab={setTab}
        tabs={[
          { value: "differences", label: "Differences", count: differing.length },
          { value: "review", label: "Needs you", count: parked.length },
          { value: "all", label: "All", count: list.total },
        ]}
      />
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Runs", href: "/runs" }, { label: runId.slice(0, 8), href: `/runs/${runId}`, mono: true }, { label: "Inbox" }]}>
          <Search />
        </TopBar>
        <div className="flex min-h-0 grow flex-col items-center justify-center px-6">
          <Icon name="mail" size={22} className="text-ink-faint" />
          <p className="mt-3 max-w-[46ch] text-center text-body text-ink-tertiary">
            {list.total === 0
              ? "This run has no emails yet. They arrive as ingest hands them over."
              : "Choose a message to read it, the seam under it, and what Retina made of the two documents."}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
