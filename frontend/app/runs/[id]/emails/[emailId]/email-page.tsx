"use client";

import { useState } from "react";
import useSWR from "swr";

import { AppShell } from "@/components/shell/app-shell";
import { CallsTab } from "@/components/email/calls-tab";
import { CaseTab } from "@/components/email/case-tab";
import { ChatRail } from "@/components/email/chat-rail";
import { CheckTab, rowsOf } from "@/components/email/check-tab";
import { DocumentsTab } from "@/components/email/documents-tab";
import { EmailList } from "@/components/email/email-list";
import { type Message, MessageStrip } from "@/components/email/message-card";
import { EnumChip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import { TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { EmailTrace, RunEmailsPage } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { ActionBar } from "./action-bar";
import { chatScope, openingLine, statusOf } from "./email-reading";

/**
 * One email: the message, the seam, and what Retina made of it. Three tabs
 * over one page, never three pages, because they are three readings of the
 * same thing and the message stays above all of them.
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
  const [tab, setTab] = useState("check");
  const [listTab, setListTab] = useState("all");
  const terminal = ["done", "failed", "review"].includes(initialTrace.stage);

  const { data: trace = initialTrace } = useSWR(
    `/api/runs/${runId}/emails/${initialTrace.emailId}/trace`,
    parsedFetcher(EmailTrace),
    { fallbackData: initialTrace, refreshInterval: terminal ? 0 : LIVE_MS, keepPreviousData: true },
  );

  const rows = rowsOf(trace);
  const status = statusOf(trace);
  const differing = trace.comparison?.defectFields.length ?? 0;
  const documentsOpen = tab === "documents";

  return (
    <AppShell
      active="inbox"
      counts={{ inbox: initialList.total, review: trace.review ? 1 : 0 }}
      wantsWidth={documentsOpen}
    >
      {!documentsOpen ? (
        <EmailList
          runId={runId}
          emails={initialList.emails}
          selectedId={trace.emailId}
          active={listTab}
          onTab={setListTab}
          tabs={[
            { value: "all", label: "All", count: initialList.total },
            { value: "differences", label: "Differences", count: differing },
            { value: "review", label: "Needs you", count: trace.review ? 1 : 0 },
          ]}
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="flex min-w-0 grow flex-col border-r border-hairline">
        <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-hairline px-6">
          <div className="min-w-0">
            <h1 className="truncate text-title font-semibold tracking-[-0.015em]">{subject}</h1>
            <p className="mt-0.5 font-mono text-mono-sm text-ink-tertiary">{trace.emailId}</p>
          </div>
          <span className="grow" />
          <EnumChip value={status.value} tone={status.tone} />
        </header>

        <div className="flex h-[42px] shrink-0 items-stretch gap-5 border-b border-hairline px-6">
          <TabList
            layoutId="email-tabs"
            value={tab}
            tabs={[
              { value: "check", label: trace.review ? "The case" : "The check", count: trace.review ? 1 : rows.length },
              { value: "documents", label: "Both documents", count: trace.documents.length },
              { value: "calls", label: "Model calls", count: trace.calls.length },
            ]}
          />
        </div>

        {documentsOpen ? <MessageStrip message={message} onOpen={() => setTab("check")} /> : null}

        <div className="flex min-h-0 grow flex-col overflow-y-auto">
          <TabPanel value="check" className="focus-visible:outline-none">
            {trace.review ? (
              <CaseTab trace={trace} message={message} review={trace.review} />
            ) : (
              <CheckTab trace={trace} message={message} />
            )}
          </TabPanel>
          <TabPanel value="documents" className="flex min-h-0 grow flex-col focus-visible:outline-none">
            <DocumentsTab trace={trace} rows={rows} />
          </TabPanel>
          <TabPanel value="calls" className="focus-visible:outline-none">
            <CallsTab calls={trace.calls} />
          </TabPanel>
        </div>

        <LinksStrip trace={trace} />
        <ActionBar review={trace.review !== null} />
      </Tabs>

      <ChatRail
        scope={chatScope(trace)}
        opening={openingLine(trace)}
        suggestions={trace.review ? ["Upload a copy", "Leave a note"] : ["Reclassify", "Correct a field"]}
      />
    </AppShell>
  );
}

/** Where this email sits in the model. Every chip is a destination phase 10b opens. */
function LinksStrip({ trace }: { trace: EmailTrace }) {
  const links = [
    { key: "Differences", count: trace.comparison?.defectFields.length ?? 0, icon: "diff" as const },
    { key: "Documents", count: trace.documents.length, icon: "doc" as const },
    { key: "Model calls", count: trace.calls.length, icon: "scale" as const },
  ];
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t border-hairline px-6">
      <span className="shrink-0 text-caption text-ink-tertiary">Links to</span>
      {links.map((link) => (
        <span
          key={link.key}
          title="The record behind this arrives with the database page, in phase 10"
          className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-sunken px-2"
        >
          <Icon name={link.icon} size={11} className="shrink-0 text-ink-faint" />
          <span className="text-caption text-ink-secondary">{link.key}</span>
          <span className="text-caption font-medium tabular-nums">{link.count}</span>
        </span>
      ))}
    </div>
  );
}
