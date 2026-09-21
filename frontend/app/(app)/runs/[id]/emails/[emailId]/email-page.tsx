"use client";

import { useState } from "react";
import useSWR from "swr";

import { PageContext } from "@/components/dock/page-context-announcer";
import { openingLine } from "@/components/email/email-reading";
import { EmailPane } from "@/components/email/email-pane";
import { EmailList } from "@/components/email/email-list";
import type { Message } from "@/components/email/message-card";
import { NavCounts } from "@/components/shell/nav-counts";
import { EmailTrace, RunEmailsPage } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

/**
 * One email of a run, reached from the inbox. The list on the left and the
 * pane in the middle; the pane is the same one the review queue opens, so
 * there is one case component set in the product and not two.
 */

const LIVE_MS = 3000;

interface EmailPageProps {
  runId: string;
  initialTrace: EmailTrace;
  message: Message;
  subject: string;
  initialList: RunEmailsPage;
}

export function EmailPage({ runId, initialTrace, message, subject, initialList }: EmailPageProps) {
  const [listTab, setListTab] = useState("differences");
  const terminal = ["done", "failed", "review"].includes(initialTrace.stage);

  const { data: trace = initialTrace, mutate } = useSWR(
    `/api/runs/${runId}/emails/${initialTrace.emailId}/trace`,
    parsedFetcher(EmailTrace),
    { fallbackData: initialTrace, refreshInterval: terminal ? 0 : LIVE_MS, keepPreviousData: true },
  );

  const differing = trace.comparison?.defectFields.length ?? 0;

  return (
    <>
      <NavCounts counts={{ inbox: initialList.total, review: trace.review ? 1 : 0 }} />
      <EmailList
        runId={runId}
        emails={initialList.emails}
        selectedId={trace.emailId}
        active={listTab}
        onTab={setListTab}
        tabs={[
          { value: "differences", label: "Differences", count: differing },
          { value: "review", label: "Needs you", count: trace.review ? 1 : 0 },
          { value: "all", label: "All", count: initialList.total },
        ]}
      />

      <EmailPane trace={trace} message={message} subject={subject} onChanged={() => void mutate()} />

      <PageContext
        refs={[
          { kind: "email", id: trace.emailId, title: trace.emailId },
          { kind: "run", id: runId, title: `run ${runId.slice(0, 8)}` },
        ]}
        note={openingLine(trace)}
        suggestions={
          trace.review
            ? ["Why did this need a person?", "What did the parser see?"]
            : ["Why do these two fields differ?", "Has this client differed before?"]
        }
      />
    </>
  );
}
