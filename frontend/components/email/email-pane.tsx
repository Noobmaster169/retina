"use client";

import { useState } from "react";

import { ActionBar } from "@/components/review/action-bar";
import { useReviewer } from "@/components/review/reviewer";
import { useCaseActions } from "@/components/review/use-case-actions";
import { EnumChip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import { TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import type { EmailTrace } from "@/lib/api/trace-schemas";

import { CallsTab } from "./calls-tab";
import { CaseTab } from "./case-tab";
import { firstCorrectable } from "./case-fields";
import { CheckTab, rowsOf } from "./check-tab";
import { DocumentsTab } from "./documents-tab";
import { statusOf } from "./email-reading";
import { type Message, MessageStrip } from "./message-card";

/**
 * One email, whichever list it was reached from: the message, the seam, and
 * what Retina made of it. Three tabs over one page, never three pages, because
 * they are three readings of the same thing and the message stays above all of
 * them.
 *
 * The review queue opens this same pane. There is one case component set in
 * the product and this is the column it lives in.
 */

interface EmailPaneProps {
  trace: EmailTrace;
  message: Message;
  subject: string;
  /** Re-read the trace and whatever list is beside it, after a write. */
  onChanged: () => void;
}

export function EmailPane({ trace, message, subject, onChanged }: EmailPaneProps) {
  const [tab, setTab] = useState("check");
  const [correctingField, setCorrectingField] = useState<string | null>(null);
  const reviewer = useReviewer();
  const review = trace.review;
  const actions = useCaseActions(review?.id ?? null, reviewer.name, onChanged);

  const rows = rowsOf(trace);
  const sizes = Object.fromEntries(trace.documents.map((document) => [document.filename, document.bytes]));
  const status = statusOf(trace);
  const documentsOpen = tab === "documents";
  const correctable = review?.status === "open" && review.kind === "review" && rows.length > 0;

  const correcting = correctable
    ? {
        field: correctingField,
        pending: actions.pending === "correct_field",
        open: setCorrectingField,
        close: () => setCorrectingField(null),
        record: (field: string, side: "SI" | "BL", value: string) => {
          void actions.act({ kind: "correct_field", field, side, value });
        },
      }
    : undefined;

  return (
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
            { value: "check", label: review ? "The case" : "The check", count: review ? 1 : rows.length },
            { value: "documents", label: "Both documents", count: trace.documents.length },
            { value: "calls", label: "Model calls", count: trace.calls.length },
          ]}
        />
      </div>

      {documentsOpen ? <MessageStrip message={message} onOpen={() => setTab("check")} /> : null}

      <div className="flex min-h-0 grow flex-col overflow-y-auto">
        <TabPanel value="check" className="focus-visible:outline-none">
          {review ? (
            <CaseTab trace={trace} message={message} sizes={sizes} review={review} correcting={correcting} />
          ) : (
            <CheckTab trace={trace} message={message} sizes={sizes} />
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
      <ActionBar
        review={review}
        actions={actions}
        actor={reviewer.name}
        onName={reviewer.set}
        onCorrect={
          correctable
            ? () => {
                setTab("check");
                setCorrectingField(firstCorrectable(trace));
              }
            : undefined
        }
      />
    </Tabs>
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
